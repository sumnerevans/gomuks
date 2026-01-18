// gomuks - A Matrix client written in Go.
// Copyright (C) 2025 Tulir Asokan
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
import { JSX } from "react"
import { MemDBEvent } from "@/api/types"
import { Preferences } from "@/api/types/preferences"
import TimelineEvent, { TimelineEventViewType } from "./TimelineEvent.tsx"
import { HiddenEvent, getBodyType } from "./content"

interface renderTimelineListParams {
	focusedEventRowID?: number | null
	prevEventOverride?: MemDBEvent
}

function isHiddenEvent(entry: MemDBEvent) {
	switch (entry.type) {
	case "m.room.server_acl":
		return true
	}
	return getBodyType(entry, Boolean(entry.redacted_by && !entry.viewing_redacted)) === HiddenEvent
}

export function renderTimelineList(
	viewType: TimelineEventViewType,
	timeline: (MemDBEvent | null)[],
	prefs: Preferences,
	{ focusedEventRowID, prevEventOverride }: renderTimelineListParams = {},
): (JSX.Element | null)[] {
	let prevEvt: MemDBEvent | null = prevEventOverride ?? null
	return timeline.map(entry => {
		if (!entry) {
			return null
		} else if (entry.type === "m.room.member" && !prefs.show_membership_events) {
			return null
		} else if (entry.redacted_by && !prefs.show_redacted_events) {
			return null
		} else if (!prefs.show_hidden_events && isHiddenEvent(entry)) {
			return null
		}
		const thisEvt = <TimelineEvent
			key={entry.rowid}
			evt={entry}
			prevEvt={prevEvt}
			smallReplies={prefs.small_replies}
			smallThreads={prefs.small_threads}
			isFocused={focusedEventRowID === entry.rowid}
			viewType={viewType}
		/>
		prevEvt = entry
		return thisEvt
	})
}
