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
import { use, useEffect, useLayoutEffect, useRef, useState } from "react"
import { ScaleLoader } from "react-spinners"
import { usePreference, useRoomEvent } from "@/api/statestore"
import { EventID, EventRowID, MemDBEvent } from "@/api/types"
import ClientContext from "../ClientContext.ts"
import { useRoomContext } from "../roomview/roomcontext.ts"
import TimelineEvent from "./TimelineEvent.tsx"
import { renderTimelineList } from "./timelineutil.tsx"

export interface ThreadViewProps {
	threadRoot: EventID
}

const ThreadView = ({ threadRoot }: ThreadViewProps) => {
	const client = use(ClientContext)!
	const roomCtx = useRoomContext()
	const room = roomCtx.store
	const [prevBatch, setPrevBatch] = useState("")
	const [loading, setLoading] = useState(false)
	const [timeline, setTimeline] = useState<MemDBEvent[]>([])
	const [focusedEventRowID, directSetFocusedEventRowID] = useState<EventRowID | null>(null)
	const scrollFixRef = useRef<number>(null)
	const bottomRef = useRef<HTMLDivElement>(null)
	const scrolledToBottom = useRef(true)
	const viewRef = useRef<HTMLDivElement>(null)
	const smallReplies = usePreference(client.store, room, "small_replies")
	const rootEvent = useRoomEvent(room, threadRoot)
	client.requestEvent(room, threadRoot)

	useEffect(() => {
		roomCtx.directSetThreadFocusedEventRowID = directSetFocusedEventRowID
	}, [roomCtx])
	useEffect(() => {
		setLoading(true)
		setTimeline([])
		client.rpc.paginateManual(room.roomID, "", "b", { threadRoot })
			.then(res => {
				setPrevBatch(res.next_batch)
				setTimeline(res.events.reverse().map(evt => room.applyEvent(evt)))
			}, err => {
				console.error("Failed to load thread history", err)
			})
			.finally(() => setLoading(false))
		return room.subscribeThread(threadRoot, evts => {
			setTimeline(currentTimeline => [...currentTimeline, ...evts])
		})
	}, [client, room, threadRoot])

	const loadHistory = () => {
		setLoading(true)
		client.rpc.paginateManual(room.roomID, prevBatch, "b", { threadRoot })
			.then(res => {
				scrollFixRef.current = viewRef.current?.scrollHeight ?? null
				setPrevBatch(res.next_batch)
				setTimeline(currentTimeline => [
					...res.events.reverse().map(evt => room.applyEvent(evt)),
					...currentTimeline,
				])
			}, err => {
				console.error("Failed to load thread history", err)
			})
			.finally(() => setLoading(false))
	}
	useEffect(() => {
		if (!prevBatch && rootEvent && timeline[0]?.event_id !== rootEvent.event_id) {
			// If we paginated through the thread and the root event is not at the top,
			// add it to the top of the timeline.
			setTimeline(currentTimeline => [rootEvent, ...currentTimeline])
		}
	}, [timeline, rootEvent, prevBatch])
	useLayoutEffect(() => {
		if (bottomRef.current && scrolledToBottom.current) {
			bottomRef.current.scrollIntoView()
		} else if (scrollFixRef.current && viewRef.current) {
			viewRef.current.scrollTo({
				top: viewRef.current.scrollTop + (viewRef.current.scrollHeight - scrollFixRef.current),
				behavior: "instant",
			})
		}
		scrollFixRef.current = null
	}, [timeline])
	const handleScroll = () => {
		if (!viewRef.current) {
			return
		}
		const timelineView = viewRef.current
		scrolledToBottom.current = timelineView.scrollTop + timelineView.clientHeight + 1 >= timelineView.scrollHeight
	}

	const prependRoot = rootEvent && !prevBatch
	const timelineDiv = <div className="timeline-view" ref={viewRef} onScroll={handleScroll}>
		<div className="timeline-edge">
			{(prevBatch || loading) ? <button onClick={loadHistory} disabled={loading}>
				{loading
					? <><ScaleLoader color="var(--primary-color)"/> Loading history...</>
					: "Load more history"}
			</button> : null}
		</div>
		<div className="timeline-list">
			{prependRoot ? <TimelineEvent
				prevEvt={null}
				evt={rootEvent}
				smallReplies={smallReplies}
				isFocused={focusedEventRowID === rootEvent.rowid}
				threadView={true}
			/> : null}
			{renderTimelineList(timeline, {
				smallReplies,
				threadView: true,
				prevEventOverride: prependRoot ? rootEvent : undefined,
				focusedEventRowID,
			})}
			<div className="timeline-bottom-ref" ref={bottomRef}/>
		</div>
	</div>
	return <div className="thread-view">
		{timelineDiv}
	</div>
}

export default ThreadView
