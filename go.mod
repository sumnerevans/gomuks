module go.mau.fi/gomuks

go 1.23.0

toolchain go1.23.4

require (
	github.com/alecthomas/chroma/v2 v2.15.0
	github.com/buckket/go-blurhash v1.1.0
	github.com/chzyer/readline v1.5.1
	github.com/coder/websocket v1.8.12
	github.com/gabriel-vasile/mimetype v1.4.8
	github.com/lucasb-eyer/go-colorful v1.2.0
	github.com/mattn/go-sqlite3 v1.14.24
	github.com/rivo/uniseg v0.4.7
	github.com/rs/zerolog v1.33.0
	github.com/tidwall/gjson v1.18.0
	github.com/tidwall/sjson v1.2.5
	github.com/yuin/goldmark v1.7.8
	go.mau.fi/util v0.8.4
	go.mau.fi/zeroconfig v0.1.3
	golang.org/x/crypto v0.32.0
	golang.org/x/image v0.23.0
	golang.org/x/net v0.34.0
	golang.org/x/text v0.21.0
	gopkg.in/yaml.v3 v3.0.1
	maunium.net/go/mauflag v1.0.0
	maunium.net/go/mautrix v0.22.2-0.20250106152426-68eaa9d1df1f
	mvdan.cc/xurls/v2 v2.6.0
)

require (
	filippo.io/edwards25519 v1.1.0 // indirect
	github.com/coreos/go-systemd/v22 v22.5.0 // indirect
	github.com/dlclark/regexp2 v1.11.4 // indirect
	github.com/mattn/go-colorable v0.1.14 // indirect
	github.com/mattn/go-isatty v0.0.20 // indirect
	github.com/petermattis/goid v0.0.0-20241211131331-93ee7e083c43 // indirect
	github.com/rs/xid v1.6.0 // indirect
	github.com/tidwall/match v1.1.1 // indirect
	github.com/tidwall/pretty v1.2.1 // indirect
	golang.org/x/exp v0.0.0-20250106191152-7588d65b2ba8 // indirect
	golang.org/x/sys v0.29.0 // indirect
	gopkg.in/natefinch/lumberjack.v2 v2.2.1 // indirect
)

replace maunium.net/go/mautrix => ../../sumnerevans/beeper/github.com/mautrix/go
