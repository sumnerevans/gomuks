// Copyright (c) 2024 Tulir Asokan
//
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at http://mozilla.org/MPL/2.0/.

package database

import (
	"context"
	"database/sql"
	"errors"
	"time"

	"go.mau.fi/util/dbutil"
	"go.mau.fi/util/jsontime"
	"maunium.net/go/mautrix"
	"maunium.net/go/mautrix/event"
	"maunium.net/go/mautrix/id"
)

const (
	getRoomBaseQuery = `
		SELECT room_id, creation_content, tombstone_content, name, name_quality, avatar, explicit_avatar, topic, canonical_alias,
		       lazy_load_summary, encryption_event, has_member_list, preview_event_rowid, sorting_timestamp,
		       unread_highlights, unread_notifications, unread_messages, prev_batch
		FROM room
	`
	getRoomsBySortingTimestampQuery = getRoomBaseQuery + `WHERE sorting_timestamp < $1 AND sorting_timestamp > 0 ORDER BY sorting_timestamp DESC LIMIT $2`
	getRoomByIDQuery                = getRoomBaseQuery + `WHERE room_id = $1`
	ensureRoomExistsQuery           = `
		INSERT INTO room (room_id) VALUES ($1)
		ON CONFLICT (room_id) DO NOTHING
	`
	upsertRoomFromSyncQuery = `
		UPDATE room
		SET creation_content = COALESCE(room.creation_content, $2),
		    tombstone_content = COALESCE(room.tombstone_content, $3),
			name = COALESCE($4, room.name),
			name_quality = CASE WHEN $4 IS NOT NULL THEN $5 ELSE room.name_quality END,
			avatar = COALESCE($6, room.avatar),
			explicit_avatar = CASE WHEN $6 IS NOT NULL THEN $7 ELSE room.explicit_avatar END,
			topic = COALESCE($8, room.topic),
			canonical_alias = COALESCE($9, room.canonical_alias),
			lazy_load_summary = COALESCE($10, room.lazy_load_summary),
			encryption_event = COALESCE($11, room.encryption_event),
			has_member_list = room.has_member_list OR $12,
			preview_event_rowid = COALESCE($13, room.preview_event_rowid),
			sorting_timestamp = COALESCE($14, room.sorting_timestamp),
			unread_highlights = COALESCE($15, room.unread_highlights),
			unread_notifications = COALESCE($16, room.unread_notifications),
			unread_messages = COALESCE($17, room.unread_messages),
			prev_batch = COALESCE($18, room.prev_batch)
		WHERE room_id = $1
	`
	setRoomPrevBatchQuery = `
		UPDATE room SET prev_batch = $2 WHERE room_id = $1
	`
	updateRoomPreviewIfLaterOnTimelineQuery = `
		UPDATE room
		SET preview_event_rowid = $2
		WHERE room_id = $1
		  AND COALESCE((SELECT rowid FROM timeline WHERE event_rowid = $2), -1)
		          > COALESCE((SELECT rowid FROM timeline WHERE event_rowid = preview_event_rowid), 0)
		RETURNING preview_event_rowid
	`
	recalculateRoomPreviewEventQuery = `
		SELECT rowid
		FROM event
		WHERE
			room_id = $1
			AND (type IN ('m.room.message', 'm.sticker')
				OR (type = 'm.room.encrypted'
					AND decrypted_type IN ('m.room.message', 'm.sticker')))
			AND relation_type <> 'm.replace'
			AND redacted_by IS NULL
		ORDER BY timestamp DESC
		LIMIT 1
	`
)

type RoomQuery struct {
	*dbutil.QueryHelper[*Room]
}

func (rq *RoomQuery) Get(ctx context.Context, roomID id.RoomID) (*Room, error) {
	return rq.QueryOne(ctx, getRoomByIDQuery, roomID)
}

func (rq *RoomQuery) GetBySortTS(ctx context.Context, maxTS time.Time, limit int) ([]*Room, error) {
	return rq.QueryMany(ctx, getRoomsBySortingTimestampQuery, maxTS.UnixMilli(), limit)
}

func (rq *RoomQuery) Upsert(ctx context.Context, room *Room) error {
	return rq.Exec(ctx, upsertRoomFromSyncQuery, room.sqlVariables()...)
}

func (rq *RoomQuery) CreateRow(ctx context.Context, roomID id.RoomID) error {
	return rq.Exec(ctx, ensureRoomExistsQuery, roomID)
}

func (rq *RoomQuery) SetPrevBatch(ctx context.Context, roomID id.RoomID, prevBatch string) error {
	return rq.Exec(ctx, setRoomPrevBatchQuery, roomID, prevBatch)
}

func (rq *RoomQuery) UpdatePreviewIfLaterOnTimeline(ctx context.Context, roomID id.RoomID, rowID EventRowID) (previewChanged bool, err error) {
	var newPreviewRowID EventRowID
	err = rq.GetDB().QueryRow(ctx, updateRoomPreviewIfLaterOnTimelineQuery, roomID, rowID).Scan(&newPreviewRowID)
	if errors.Is(err, sql.ErrNoRows) {
		err = nil
	} else if err == nil {
		previewChanged = newPreviewRowID == rowID
	}
	return
}

func (rq *RoomQuery) RecalculatePreview(ctx context.Context, roomID id.RoomID) (rowID EventRowID, err error) {
	err = rq.GetDB().QueryRow(ctx, recalculateRoomPreviewEventQuery, roomID).Scan(&rowID)
	return
}

type NameQuality int

const (
	NameQualityNil NameQuality = iota
	NameQualityParticipants
	NameQualityCanonicalAlias
	NameQualityExplicit
)

const PrevBatchPaginationComplete = "fi.mau.gomuks.pagination_complete"

type Room struct {
	ID              id.RoomID                    `json:"room_id"`
	CreationContent *event.CreateEventContent    `json:"creation_content,omitempty"`
	Tombstone       *event.TombstoneEventContent `json:"tombstone,omitempty"`

	Name           *string        `json:"name,omitempty"`
	NameQuality    NameQuality    `json:"name_quality"`
	Avatar         *id.ContentURI `json:"avatar,omitempty"`
	ExplicitAvatar bool           `json:"explicit_avatar"`
	Topic          *string        `json:"topic,omitempty"`
	CanonicalAlias *id.RoomAlias  `json:"canonical_alias,omitempty"`

	LazyLoadSummary *mautrix.LazyLoadSummary `json:"lazy_load_summary,omitempty"`

	EncryptionEvent *event.EncryptionEventContent `json:"encryption_event,omitempty"`
	HasMemberList   bool                          `json:"has_member_list"`

	PreviewEventRowID EventRowID         `json:"preview_event_rowid"`
	SortingTimestamp  jsontime.UnixMilli `json:"sorting_timestamp"`
	UnreadCounts

	PrevBatch string `json:"prev_batch"`
}

func (r *Room) CheckChangesAndCopyInto(other *Room) (hasChanges bool) {
	if r.CreationContent != nil {
		other.CreationContent = r.CreationContent
		hasChanges = true
	}
	if r.Tombstone != nil {
		other.Tombstone = r.Tombstone
		hasChanges = true
	}
	if r.Name != nil && r.NameQuality >= other.NameQuality {
		other.Name = r.Name
		other.NameQuality = r.NameQuality
		hasChanges = true
	}
	if r.Avatar != nil {
		other.Avatar = r.Avatar
		other.ExplicitAvatar = r.ExplicitAvatar
		hasChanges = true
	}
	if r.Topic != nil {
		other.Topic = r.Topic
		hasChanges = true
	}
	if r.CanonicalAlias != nil {
		other.CanonicalAlias = r.CanonicalAlias
		hasChanges = true
	}
	if r.LazyLoadSummary != nil {
		other.LazyLoadSummary = r.LazyLoadSummary
		hasChanges = true
	}
	if r.EncryptionEvent != nil && other.EncryptionEvent == nil {
		other.EncryptionEvent = r.EncryptionEvent
		hasChanges = true
	}
	if r.HasMemberList && !other.HasMemberList {
		hasChanges = true
		other.HasMemberList = true
	}
	if r.PreviewEventRowID > other.PreviewEventRowID {
		other.PreviewEventRowID = r.PreviewEventRowID
		hasChanges = true
	}
	if r.SortingTimestamp.After(other.SortingTimestamp.Time) {
		other.SortingTimestamp = r.SortingTimestamp
		hasChanges = true
	}
	if r.UnreadHighlights != other.UnreadHighlights {
		other.UnreadHighlights = r.UnreadHighlights
		hasChanges = true
	}
	if r.UnreadNotifications != other.UnreadNotifications {
		other.UnreadNotifications = r.UnreadNotifications
		hasChanges = true
	}
	if r.UnreadMessages != other.UnreadMessages {
		other.UnreadMessages = r.UnreadMessages
		hasChanges = true
	}
	if r.PrevBatch != "" && other.PrevBatch == "" {
		other.PrevBatch = r.PrevBatch
		hasChanges = true
	}
	return
}

func (r *Room) Scan(row dbutil.Scannable) (*Room, error) {
	var prevBatch sql.NullString
	var previewEventRowID, sortingTimestamp sql.NullInt64
	err := row.Scan(
		&r.ID,
		dbutil.JSON{Data: &r.CreationContent},
		dbutil.JSON{Data: &r.Tombstone},
		&r.Name,
		&r.NameQuality,
		&r.Avatar,
		&r.ExplicitAvatar,
		&r.Topic,
		&r.CanonicalAlias,
		dbutil.JSON{Data: &r.LazyLoadSummary},
		dbutil.JSON{Data: &r.EncryptionEvent},
		&r.HasMemberList,
		&previewEventRowID,
		&sortingTimestamp,
		&r.UnreadHighlights,
		&r.UnreadNotifications,
		&r.UnreadMessages,
		&prevBatch,
	)
	if err != nil {
		return nil, err
	}
	r.PrevBatch = prevBatch.String
	r.PreviewEventRowID = EventRowID(previewEventRowID.Int64)
	r.SortingTimestamp = jsontime.UM(time.UnixMilli(sortingTimestamp.Int64))
	return r, nil
}

func (r *Room) sqlVariables() []any {
	return []any{
		r.ID,
		dbutil.JSONPtr(r.CreationContent),
		dbutil.JSONPtr(r.Tombstone),
		r.Name,
		r.NameQuality,
		r.Avatar,
		r.ExplicitAvatar,
		r.Topic,
		r.CanonicalAlias,
		dbutil.JSONPtr(r.LazyLoadSummary),
		dbutil.JSONPtr(r.EncryptionEvent),
		r.HasMemberList,
		dbutil.NumPtr(r.PreviewEventRowID),
		dbutil.UnixMilliPtr(r.SortingTimestamp.Time),
		r.UnreadHighlights,
		r.UnreadNotifications,
		r.UnreadMessages,
		dbutil.StrPtr(r.PrevBatch),
	}
}

func (r *Room) BumpSortingTimestamp(evt *Event) bool {
	if !evt.BumpsSortingTimestamp() || evt.Timestamp.Before(r.SortingTimestamp.Time) {
		return false
	}
	r.SortingTimestamp = evt.Timestamp
	now := time.Now()
	if r.SortingTimestamp.After(now) {
		r.SortingTimestamp = jsontime.UM(now)
	}
	return true
}