// gomuks - A Matrix client written in Go.
// Copyright (C) 2024 Tulir Asokan
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.
//
// This program is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
// GNU Affero General Public License for more details.
//
// You should have received a copy of the GNU Affero General Public License
// along with this program.  If not, see <https://www.gnu.org/licenses/>.
import React, { use, useCallback } from "react"
import { getAvatarURL } from "@/api/media.ts"
import { RoomStateStore, useRoomState } from "@/api/statestore"
import { EventID, MemDBEvent, MemberEventContent, UnreadType } from "@/api/types"
import { isEventID } from "@/util/validation.ts"
import { ClientContext } from "../ClientContext.ts"
import { LightboxContext } from "../Lightbox.tsx"
import { ReplyIDBody } from "./ReplyBody.tsx"
import getBodyType, { ContentErrorBoundary, EventContentProps, HiddenEvent, MemberBody } from "./content"
import ErrorIcon from "../../icons/error.svg?react"
import PendingIcon from "../../icons/pending.svg?react"
import SentIcon from "../../icons/sent.svg?react"
import "./TimelineEvent.css"

export interface TimelineEventProps {
	room: RoomStateStore
	evt: MemDBEvent
	prevEvt: MemDBEvent | null
	setReplyToRef: React.RefObject<(evt: EventID | null) => void>
}

const fullTimeFormatter = new Intl.DateTimeFormat("en-GB", { dateStyle: "full", timeStyle: "medium" })
const dateFormatter = new Intl.DateTimeFormat("en-GB", { dateStyle: "full" })
const formatShortTime = (time: Date) =>
	`${time.getHours().toString().padStart(2, "0")}:${time.getMinutes().toString().padStart(2, "0")}`

const EventReactions = ({ reactions }: { reactions: Record<string, number> }) => {
	return <div className="event-reactions">
		{Object.entries(reactions).map(([reaction, count]) => count > 0 ? <span key={reaction} className="reaction" title={reaction}>
			<span className="reaction">{reaction}</span> <span className="reaction-count">{count}</span>
		</span> : null)}
	</div>
}

const EventSendStatus = ({ evt }: { evt: MemDBEvent }) => {
	if (evt.send_error && evt.send_error !== "not sent") {
		return <div className="event-send-status error" title={evt.send_error}><ErrorIcon/></div>
	} else if (evt.event_id.startsWith("~")) {
		return <div title="Waiting for /send to return" className="event-send-status sending"><PendingIcon/></div>
	} else if (evt.pending) {
		return <div title="Waiting to receive event in /sync" className="event-send-status sent"><SentIcon/></div>
	} else {
		return <div title="Event sent and remote echo received" className="event-send-status sent"><SentIcon/></div>
	}
}

function isSmallEvent(bodyType: React.FunctionComponent<EventContentProps>): boolean {
	return bodyType === HiddenEvent || bodyType === MemberBody
}

const TimelineEvent = ({ room, evt, prevEvt, setReplyToRef }: TimelineEventProps) => {
	const wrappedSetReplyTo = useCallback(() => setReplyToRef.current(evt.event_id), [evt, setReplyToRef])
	const client = use(ClientContext)!
	const memberEvt = useRoomState(room, "m.room.member", evt.sender)
	const memberEvtContent = memberEvt?.content as MemberEventContent | undefined
	const BodyType = getBodyType(evt)
	const eventTS = new Date(evt.timestamp)
	const editEventTS = evt.last_edit ? new Date(evt.last_edit.timestamp) : null
	const wrapperClassNames = ["timeline-event"]
	if (evt.unread_type & UnreadType.Highlight) {
		wrapperClassNames.push("highlight")
	}
	let smallAvatar = false
	if (isSmallEvent(BodyType)) {
		wrapperClassNames.push("hidden-event")
		smallAvatar = true
	} else if (prevEvt?.sender === evt.sender &&
		prevEvt.timestamp + 15 * 60 * 1000 > evt.timestamp &&
		!isSmallEvent(getBodyType(prevEvt))) {
		wrapperClassNames.push("same-sender")
		smallAvatar = true
	}
	const fullTime = fullTimeFormatter.format(eventTS)
	const shortTime = formatShortTime(eventTS)
	const editTime = editEventTS ? `Edited at ${fullTimeFormatter.format(editEventTS)}` : null
	const replyTo = (evt.orig_content ?? evt.content)["m.relates_to"]?.["m.in_reply_to"]?.event_id
	const mainEvent = <div data-event-id={evt.event_id} className={wrapperClassNames.join(" ")}>
		<div className="sender-avatar" title={evt.sender}>
			<img
				className={`${smallAvatar ? "small" : ""} avatar`}
				loading="lazy"
				src={getAvatarURL(evt.sender, memberEvtContent?.avatar_url)}
				onClick={use(LightboxContext)!}
				alt=""
			/>
		</div>
		<div className="event-sender-and-time" onClick={wrappedSetReplyTo}>
			<span className="event-sender">{memberEvtContent?.displayname || evt.sender}</span>
			<span className="event-time" title={fullTime}>{shortTime}</span>
			{(editEventTS && editTime) ? <span className="event-edited" title={editTime}>
				(edited at {formatShortTime(editEventTS)})
			</span> : null}
		</div>
		<div className="event-time-only" onClick={wrappedSetReplyTo}>
			<span className="event-time" title={editTime ? `${fullTime} - ${editTime}` : fullTime}>{shortTime}</span>
		</div>
		<div className="event-content">
			{isEventID(replyTo) && BodyType !== HiddenEvent ? <ReplyIDBody room={room} eventID={replyTo}/> : null}
			<ContentErrorBoundary>
				<BodyType room={room} sender={memberEvt} event={evt}/>
			</ContentErrorBoundary>
			{evt.reactions ? <EventReactions reactions={evt.reactions}/> : null}
		</div>
		{evt.sender === client.userID && evt.transaction_id ? <EventSendStatus evt={evt}/> : null}
	</div>
	let dateSeparator = null
	const prevEvtDate = prevEvt ? new Date(prevEvt.timestamp) : null
	if (prevEvtDate && (
		eventTS.getDay() !== prevEvtDate.getDay() ||
		eventTS.getMonth() !== prevEvtDate.getMonth() ||
		eventTS.getFullYear() !== prevEvtDate.getFullYear())) {
		dateSeparator = <div className="date-separator">
			<hr role="none"/>
			{dateFormatter.format(eventTS)}
			<hr role="none"/>
		</div>
	}
	return <>
		{dateSeparator}
		{mainEvent}
	</>
}

export default React.memo(TimelineEvent)
