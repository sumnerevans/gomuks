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
import React, { CSSProperties, use, useCallback } from "react"
import Client from "@/api/client.ts"
import { MemDBEvent } from "@/api/types"
import { emojiToReactionContent } from "@/util/emoji"
import { useEventAsState } from "@/util/eventdispatcher.ts"
import EmojiPicker from "../../emojipicker/EmojiPicker.tsx"
import { ModalCloseContext, ModalContext } from "../../modal/Modal.tsx"
import { RoomContextData } from "../../roomview/roomcontext.ts"
import { EventExtraMenu } from "./EventMenu.tsx"
import { getEncryption, getModalStyleFromButton, getPending, getPowerLevels } from "./util.ts"
import EditIcon from "@/icons/edit.svg?react"
import MoreIcon from "@/icons/more.svg?react"
import ReactIcon from "@/icons/react.svg?react"
import RefreshIcon from "@/icons/refresh.svg?react"
import ReplyIcon from "@/icons/reply.svg?react"
import "./index.css"

const noop = () => {}

export const usePrimaryItems = (
	client: Client,
	roomCtx: RoomContextData,
	evt: MemDBEvent,
	isHover: boolean,
	style?: CSSProperties,
	setForceOpen?: (forceOpen: boolean) => void,
) => {
	const closeModal = !isHover ? use(ModalCloseContext) : noop
	const openModal = use(ModalContext)

	const onClickReply = useCallback(() => {
		roomCtx.setReplyTo(evt.event_id)
		closeModal()
	}, [roomCtx, evt.event_id, closeModal])
	const onClickReact = useCallback((mevt: React.MouseEvent<HTMLButtonElement>) => {
		const emojiPickerHeight = 34 * 16
		setForceOpen?.(true)
		openModal({
			content: <EmojiPicker
				style={style ?? getModalStyleFromButton(mevt.currentTarget, emojiPickerHeight)}
				onSelect={emoji => {
					client.sendEvent(evt.room_id, "m.reaction", emojiToReactionContent(emoji, evt.event_id))
						.catch(err => window.alert(`Failed to send reaction: ${err}`))
				}}
				room={roomCtx.store}
				closeOnSelect={true}
				allowFreeform={true}
			/>,
			onClose: () => setForceOpen?.(false),
		})
	}, [client, roomCtx, evt, style, setForceOpen, openModal])
	const onClickEdit = useCallback(() => {
		closeModal()
		roomCtx.setEditing(evt)
	}, [roomCtx, evt, closeModal])
	const onClickResend = useCallback(() => {
		if (!evt.transaction_id) {
			return
		}
		closeModal()
		client.resendEvent(evt.transaction_id)
			.catch(err => window.alert(`Failed to resend message: ${err}`))
	}, [client, evt.transaction_id, closeModal])
	const onClickMore = useCallback((mevt: React.MouseEvent<HTMLButtonElement>) => {
		const moreMenuHeight = 4 * 40
		setForceOpen!(true)
		openModal({
			content: <EventExtraMenu
				evt={evt}
				roomCtx={roomCtx}
				style={getModalStyleFromButton(mevt.currentTarget, moreMenuHeight)}
			/>,
			onClose: () => setForceOpen!(false),
		})
	}, [evt, roomCtx, setForceOpen, openModal])
	const isEditing = useEventAsState(roomCtx.isEditing)
	const [isPending, pendingTitle] = getPending(evt)
	const isEncrypted = getEncryption(roomCtx.store)
	const [pls, ownPL] = getPowerLevels(roomCtx.store, client)
	const reactPL = pls.events?.["m.reaction"] ?? pls.events_default ?? 0
	const evtSendType = isEncrypted ? "m.room.encrypted" : evt.type === "m.sticker" ? "m.sticker" : "m.room.message"
	const messageSendPL = pls.events?.[evtSendType] ?? pls.events_default ?? 0

	const didFail = !!evt.send_error && evt.send_error !== "not sent" && !!evt.transaction_id
	const canSend = !didFail && ownPL >= messageSendPL
	const canEdit = canSend
		&& evt.sender === client.userID
		&& evt.type === "m.room.message"
		&& evt.relation_type !== "m.replace"
		&& !evt.redacted_by
	const canReact = !didFail && ownPL >= reactPL

	return <>
		{didFail && <button onClick={onClickResend} title="Resend message">
			<RefreshIcon/>
			{!isHover && "Resend"}
		</button>}
		{canReact && <button disabled={isPending} title={pendingTitle} onClick={onClickReact}>
			<ReactIcon/>
			{!isHover && "React"}
		</button>}
		{canSend && <button
			disabled={isEditing || isPending}
			title={isEditing ? "Can't reply to messages while editing a message" : pendingTitle}
			onClick={onClickReply}
		>
			<ReplyIcon/>
			{!isHover && "Reply"}
		</button>}
		{canEdit && <button onClick={onClickEdit} disabled={isPending} title={pendingTitle}>
			<EditIcon/>
			{!isHover && "Edit"}
		</button>}
		{isHover && <button onClick={onClickMore}><MoreIcon/></button>}
	</>
}
