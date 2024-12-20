// gomuks - A Matrix client written in Go.
// Copyright (C) 2024 Sumner Evans
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
import React from "react"
import { getEncryptedMediaURL, getMediaURL } from "@/api/media"
import { MemDBEvent, URLPreview } from "@/api/types"
import { calculateMediaSize } from "@/util/mediasize"
import "./LinkPreviews.css"

const LinkPreviews = ({ event }: { event: MemDBEvent }) => {
	const previews = (event.content["com.beeper.linkpreviews"] ?? event.content["m.url_previews"]) as URLPreview[]
	if (!previews) {
		return null
	}
	return <div className="link-previews">
		{previews
			.filter(p => p["og:title"] || p["og:image"] || p["beeper:image:encryption"])
			.map(p => {
				const mediaURL = p["beeper:image:encryption"]
					? getEncryptedMediaURL(p["beeper:image:encryption"].url)
					: getMediaURL(p["og:image"])
				const style = calculateMediaSize(p["og:image:width"], p["og:image:height"])
				return <div className="link-preview" style={{ width: style.container.width }}>
					<div className="title">
						<a href={p.matched_url}><b>{p["og:title"] ?? p["og:url"] ?? p.matched_url}</b></a>
					</div>
					<div className="description">{p["og:description"]}</div>
					{mediaURL && <div className="media-container" style={style.container}>
						<img
							loading="lazy"
							style={style.media}
							src={mediaURL}
							alt={p["og:title"]}
							title={p["og:title"]}
						/>
					</div>}
				</div>
			})}
	</div>
}

export default React.memo(LinkPreviews)
