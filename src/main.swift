// Katnis — app Mac untuk rangkuman harian tim BIS.
// UI ada di web/ (HTML/CSS/JS). Swift mengurus: membaca jejak kerja di Mac ini,
// menjalankan `claude -p`, rekam suara + transkripsi, file lampiran, simpan data.

import AppKit
import WebKit
import AVFoundation
import Speech
import SQLite3

let appName = "Katnis"
let fm = FileManager.default
let home = fm.homeDirectoryForCurrentUser
let supportDir = home.appendingPathComponent("Library/Application Support/\(appName)", isDirectory: true)
let genDir = supportDir.appendingPathComponent("gen", isDirectory: true)
let tmpDir = supportDir.appendingPathComponent("tmp", isDirectory: true)
let lampDir = supportDir.appendingPathComponent("lampiran", isDirectory: true)
let storeURL = supportDir.appendingPathComponent("store.json")
let claudeDir = home.appendingPathComponent(".claude", isDirectory: true)

// MARK: - Util

func stableId(_ prefix: String, _ s: String) -> String {
    var h: UInt64 = 5381
    for b in s.utf8 { h = (h &* 33) &+ UInt64(b) }
    return prefix + String(String(h, radix: 36).suffix(7))
}

let hmFmt: DateFormatter = { let f = DateFormatter(); f.dateFormat = "HH.mm"; return f }()
let ymdFmt: DateFormatter = {
    let f = DateFormatter()
    f.calendar = Calendar(identifier: .gregorian); f.locale = Locale(identifier: "en_US_POSIX")
    f.timeZone = .current; f.dateFormat = "yyyy-MM-dd"; return f
}()
func dayRange(_ ymd: String) -> (Date, Date)? {
    guard let s = ymdFmt.date(from: ymd) else { return nil }
    return (s, Calendar.current.date(byAdding: .day, value: 1, to: s)!)
}
func clip(_ s: String, _ n: Int) -> String { s.count > n ? String(s.prefix(n - 1)).trimmingCharacters(in: .whitespaces) + "…" : s }
func sizeLabel(_ b: Int64) -> String {
    let kb = Double(b) / 1024
    if kb >= 1024 { return String(format: "%.1f MB", kb / 1024).replacingOccurrences(of: ".", with: ",") }
    return "\(max(1, Int(kb.rounded()))) KB"
}

struct Jejak {
    var id: String, src: String, ts: Date, judul: String, teks: String
    var detail = "", url = "", path = ""
    var dict: [String: Any] {
        ["id": id, "src": src, "ts": ts.timeIntervalSince1970 * 1000, "jam": hmFmt.string(from: ts),
         "judul": judul, "teks": teks, "detail": detail, "url": url, "path": path]
    }
}

// MARK: - Sumber 1: Claude Code (prompt, artifact, Figma lewat Claude)

enum ClaudeReader {
    static let skip: Set<String> = ["/clear", "/exit", "/quit", "/restart", "/usage", "/model", "/help", "/config", "/login",
                                    "/logout", "/status", "/cost", "/compact", "/resume", "/memory", "/doctor", "/mcp",
                                    "/permissions", "/init", "/fast", "/theme"]
    static let iso: ISO8601DateFormatter = { let f = ISO8601DateFormatter(); f.formatOptions = [.withInternetDateTime, .withFractionalSeconds]; return f }()
    static func parseISO(_ s: String) -> Date? { iso.date(from: s) ?? ISO8601DateFormatter().date(from: s) }

    static func clean(_ raw: String) -> String {
        var s = raw
        s = s.replacingOccurrences(of: #"\[(Image|Pasted text) #\d+[^\]]*\]"#, with: "", options: .regularExpression)
        s = s.replacingOccurrences(of: #"(^|\s)/[a-z][\w:.-]*"#, with: " ", options: [.regularExpression, .caseInsensitive])
        s = s.replacingOccurrences(of: #"\s+"#, with: " ", options: .regularExpression)
        return s.trimmingCharacters(in: .whitespacesAndNewlines)
    }
    static func project(_ path: String) -> String {
        let last = (path as NSString).lastPathComponent
        return (path == home.path || last.isEmpty) ? "umum" : last
    }

    static func forEachLine(_ data: Data, _ body: (Data, (String) -> Bool) -> Void) {
        data.withUnsafeBytes { (raw: UnsafeRawBufferPointer) in
            guard let base = raw.baseAddress else { return }
            let n = raw.count; var i = 0
            while i < n {
                let nl = memchr(base + i, 0x0A, n - i)
                let len = nl.map { UnsafeRawPointer($0) - (base + i) } ?? (n - i)
                if len > 0 {
                    let p = base + i
                    let has: (String) -> Bool = { needle in
                        needle.utf8CString.withUnsafeBufferPointer { nb in memmem(p, len, nb.baseAddress!, nb.count - 1) != nil }
                    }
                    body(Data(bytes: p, count: len), has)
                }
                i += len + 1
            }
        }
    }

    struct Sess { var project = ""; var first = Date.distantFuture; var prompts: [String] = []
                  var files = Set<String>(); var figma: [String: Int] = [:]; var figmaKeys = Set<String>(); var figmaFirst = Date.distantFuture }

    static func read(_ ymd: String) -> [Jejak] {
        guard let (start, end) = dayRange(ymd) else { return [] }
        var ss: [String: Sess] = [:]
        // 1) prompt dari history.jsonl
        if let data = try? Data(contentsOf: claudeDir.appendingPathComponent("history.jsonl")),
           let text = String(data: data, encoding: .utf8) {
            for line in text.split(separator: "\n") {
                guard let o = try? JSONSerialization.jsonObject(with: Data(line.utf8)) as? [String: Any],
                      let ms = o["timestamp"] as? Double else { continue }
                let t = Date(timeIntervalSince1970: ms / 1000)
                guard t >= start && t < end else { continue }
                let proj = o["project"] as? String ?? ""
                if proj.hasPrefix(supportDir.path) { continue }
                let disp = (o["display"] as? String ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
                if disp.isEmpty || (disp.hasPrefix("/") && !disp.contains(" ")) { continue }
                let c = clean(disp.hasPrefix("/") ? String(disp.dropFirst()) : disp)
                if c.count < 4 { continue }
                let sid = o["sessionId"] as? String ?? proj
                var s = ss[sid] ?? Sess(); s.project = project(proj); s.first = min(s.first, t)
                s.prompts.append(clip(c, 400)); ss[sid] = s
            }
        }
        // 2) transkrip: artifact terbit, file diubah, alat Figma
        var arts: [String: (String, Date, Int)] = [:]
        let pdir = claudeDir.appendingPathComponent("projects", isDirectory: true)
        let skipKey = supportDir.path.replacingOccurrences(of: "/", with: "-").replacingOccurrences(of: " ", with: "-")
        for dir in (try? fm.contentsOfDirectory(at: pdir, includingPropertiesForKeys: nil)) ?? [] where !dir.lastPathComponent.hasPrefix(skipKey) {
            for f in (try? fm.contentsOfDirectory(at: dir, includingPropertiesForKeys: [.contentModificationDateKey])) ?? [] where f.pathExtension == "jsonl" {
                let mod = (try? f.resourceValues(forKeys: [.contentModificationDateKey]))?.contentModificationDate ?? .distantPast
                if mod < start { continue }
                guard let data = try? Data(contentsOf: f, options: .mappedIfSafe) else { continue }
                forEachLine(data) { line, has in
                    let isFrame = has("\"frame-link\"")
                    let isTool = !isFrame && has("\"tool_use\"") && has("\"type\":\"assistant\"")
                    guard isFrame || isTool else { return }
                    guard let o = try? JSONSerialization.jsonObject(with: line) as? [String: Any],
                          let ts = o["timestamp"] as? String, let t = parseISO(ts), t >= start, t < end else { return }
                    if isFrame {
                        if let url = o["frameUrl"] as? String, let title = o["title"] as? String, !title.isEmpty {
                            let a = arts[url]; arts[url] = (title, min(a?.1 ?? t, t), (a?.2 ?? 0) + 1)
                        }
                        return
                    }
                    let sid = o["sessionId"] as? String ?? f.deletingPathExtension().lastPathComponent
                    guard let msg = o["message"] as? [String: Any], let content = msg["content"] as? [[String: Any]] else { return }
                    var s = ss[sid] ?? Sess()
                    if s.project.isEmpty, let cwd = o["cwd"] as? String { s.project = project(cwd) }
                    for c in content where (c["type"] as? String) == "tool_use" {
                        let name = c["name"] as? String ?? ""
                        let input = c["input"] as? [String: Any] ?? [:]
                        if name.lowercased().contains("figma") {
                            let short = name.components(separatedBy: "__").last ?? name
                            s.figma[short, default: 0] += 1; s.figmaFirst = min(s.figmaFirst, t)
                            if let k = input["fileKey"] as? String, !k.isEmpty { s.figmaKeys.insert(k) }
                        }
                        if name == "Edit" || name == "Write", let p = input["file_path"] as? String,
                           !p.contains("/scratchpad/"), !p.hasPrefix("/private/tmp"), !p.contains("/.claude/") {
                            s.files.insert((p as NSString).lastPathComponent)
                        }
                    }
                    ss[sid] = s
                }
            }
        }
        var out: [Jejak] = []
        for (sid, s) in ss {
            if !s.prompts.isEmpty {
                var detail = s.prompts.map { "- " + $0 }.joined(separator: "\n")
                if !s.files.isEmpty { detail += "\nFile diubah: " + s.files.sorted().prefix(12).joined(separator: ", ") }
                out.append(Jejak(id: stableId("c", sid), src: "claude", ts: s.first,
                                 judul: "Sesi Claude Code · \(s.project.isEmpty ? "umum" : s.project)",
                                 teks: clip(s.prompts.prefix(3).joined(separator: " · "), 260), detail: clip(detail, 3000)))
            }
            if !s.figma.isEmpty {
                let tools = s.figma.sorted { $0.value > $1.value }.map { "\($0.key) \($0.value)×" }.joined(separator: ", ")
                let key = s.figmaKeys.sorted().first ?? ""
                out.append(Jejak(id: stableId("f", sid), src: "figma", ts: s.figmaFirst == .distantFuture ? s.first : s.figmaFirst,
                                 judul: "Figma lewat Claude Code · \(s.project.isEmpty ? "umum" : s.project)",
                                 teks: "\(s.figma.values.reduce(0, +)) aksi: \(tools)",
                                 url: key.isEmpty ? "" : "https://www.figma.com/design/\(key)"))
            }
        }
        for (url, a) in arts {
            out.append(Jejak(id: stableId("a", url), src: "claude", ts: a.1, judul: "Artifact · \(a.0)",
                             teks: "Diterbitkan/diperbarui \(a.2)×", url: url))
        }
        return out
    }
}

// MARK: - Sumber 2: riwayat browser (Chrome, Arc, Brave, Edge) — hanya judul + domain kerja

enum BrowserReader {
    static let roots = ["Google/Chrome", "Arc/User Data", "BraveSoftware/Brave-Browser", "Microsoft Edge"]
    static let blockHosts = ["youtube.com", "youtu.be", "instagram.com", "facebook.com", "tiktok.com", "twitter.com", "x.com",
                             "netflix.com", "spotify.com", "shopee.co.id", "tokopedia.com", "lazada.co.id", "bukalapak.com",
                             "web.whatsapp.com", "mail.google.com", "accounts.google.com", "reddit.com", "detik.com",
                             "kompas.com", "tribunnews.com", "klikbca.com", "bca.co.id", "bankmandiri.co.id", "bri.co.id",
                             "bni.co.id", "tiket.com", "traveloka.com", "gojek.com", "grab.com", "localhost", "127.0.0.1"]
    static func blocked(_ host: String) -> Bool {
        blockHosts.contains { host == $0 || host.hasSuffix("." + $0) }
    }

    static func historyFiles() -> [URL] {
        let base = home.appendingPathComponent("Library/Application Support", isDirectory: true)
        var out: [URL] = []
        for r in roots {
            let dir = base.appendingPathComponent(r, isDirectory: true)
            guard let items = try? fm.contentsOfDirectory(atPath: dir.path) else { continue }
            for p in items where p == "Default" || p.hasPrefix("Profile ") {
                let h = dir.appendingPathComponent(p).appendingPathComponent("History")
                if fm.fileExists(atPath: h.path) { out.append(h) }
            }
        }
        return out
    }

    struct Agg { var title: String; var url: String; var host: String; var first: Date; var last: Date; var n: Int }

    static func read(_ ymd: String) -> [Jejak] {
        guard let (start, end) = dayRange(ymd) else { return [] }
        let toChrome: (Date) -> Int64 = { Int64(($0.timeIntervalSince1970 + 11_644_473_600) * 1_000_000) }
        var agg: [String: Agg] = [:]
        try? fm.createDirectory(at: tmpDir, withIntermediateDirectories: true)
        for (i, h) in historyFiles().enumerated() {
            let copy = tmpDir.appendingPathComponent("h\(i).sqlite")
            try? fm.removeItem(at: copy)
            guard (try? fm.copyItem(at: h, to: copy)) != nil else { continue }
            defer { try? fm.removeItem(at: copy) }
            var db: OpaquePointer?
            guard sqlite3_open_v2(copy.path, &db, SQLITE_OPEN_READONLY, nil) == SQLITE_OK else { continue }
            defer { sqlite3_close(db) }
            var st: OpaquePointer?
            let q = "SELECT urls.url, urls.title, visits.visit_time FROM visits JOIN urls ON urls.id = visits.url WHERE visits.visit_time >= ? AND visits.visit_time < ? ORDER BY visits.visit_time"
            guard sqlite3_prepare_v2(db, q, -1, &st, nil) == SQLITE_OK else { continue }
            defer { sqlite3_finalize(st) }
            sqlite3_bind_int64(st, 1, toChrome(start)); sqlite3_bind_int64(st, 2, toChrome(end))
            while sqlite3_step(st) == SQLITE_ROW {
                guard let u = sqlite3_column_text(st, 0) else { continue }
                let url = String(cString: u)
                let title = sqlite3_column_text(st, 1).map { String(cString: $0) } ?? ""
                let t = Date(timeIntervalSince1970: Double(sqlite3_column_int64(st, 2)) / 1_000_000 - 11_644_473_600)
                guard let comp = URLComponents(string: url), let scheme = comp.scheme, scheme.hasPrefix("http"),
                      let host0 = comp.host else { continue }
                let host = host0.hasPrefix("www.") ? String(host0.dropFirst(4)) : host0
                if blocked(host) || title.trimmingCharacters(in: .whitespaces).isEmpty { continue }
                if host.hasSuffix("google.com") && comp.path.hasPrefix("/search") { continue }
                if host == "claude.ai" && (comp.path == "/new" || comp.path == "/" || comp.path.hasPrefix("/login")) { continue }
                var key = host + comp.path
                if host.hasSuffix("figma.com") {
                    let parts = comp.path.split(separator: "/")
                    if parts.count >= 2 { key = host + "/" + parts[1] }
                }
                if var a = agg[key] { a.n += 1; a.last = max(a.last, t); a.first = min(a.first, t); if a.title.count < title.count { a.title = title }; agg[key] = a }
                else { agg[key] = Agg(title: title, url: url, host: host, first: t, last: t, n: 1) }
            }
        }
        let top = agg.sorted { $0.value.n == $1.value.n ? $0.value.first < $1.value.first : $0.value.n > $1.value.n }.prefix(40)
        return top.map { key, a in
            let isFigma = a.host.hasSuffix("figma.com")
            let when = a.n > 1 ? "Dibuka \(a.n)× antara \(hmFmt.string(from: a.first)) dan \(hmFmt.string(from: a.last))" : "Dibuka \(hmFmt.string(from: a.first))"
            var title = a.title.replacingOccurrences(of: " – Figma", with: "").replacingOccurrences(of: " - Figma", with: "")
            title = clip(title, 90)
            return Jejak(id: stableId("w", key), src: isFigma ? "figma" : "web", ts: a.first,
                         judul: isFigma ? title : "\(title) · \(a.host)", teks: when, url: a.url)
        }
    }
}

// MARK: - Sumber 3: file lokal hari itu (Desktop, Downloads, Documents)

enum LocalReader {
    static let docExt: Set<String> = ["pdf", "doc", "docx", "xls", "xlsx", "ppt", "pptx", "key", "pages", "numbers", "csv",
                                      "png", "jpg", "jpeg", "heic", "gif", "webp", "fig", "sketch", "mp4", "mov", "zip", "dmg", "apk"]
    static let skipDirs: Set<String> = ["node_modules", ".git", "build", "dist", "Library", ".venv", "venv", "Pods", "DerivedData"]

    static func read(_ ymd: String) -> [Jejak] {
        guard let (start, end) = dayRange(ymd) else { return [] }
        var out: [Jejak] = []
        let keys: [URLResourceKey] = [.creationDateKey, .contentModificationDateKey, .fileSizeKey, .isDirectoryKey, .isPackageKey]
        let places: [(String, Int, Bool)] = [("Desktop", 1, false), ("Downloads", 1, false), ("Documents", 3, true)]
        for (name, depth, onlyDocs) in places {
            let root = home.appendingPathComponent(name, isDirectory: true)
            guard let en = fm.enumerator(at: root, includingPropertiesForKeys: keys,
                                         options: [.skipsHiddenFiles, .skipsPackageDescendants]) else { continue }
            for case let u as URL in en {
                let v = try? u.resourceValues(forKeys: Set(keys))
                if v?.isDirectory == true && v?.isPackage != true {
                    if en.level >= depth || skipDirs.contains(u.lastPathComponent) { en.skipDescendants() }
                    continue
                }
                let ext = u.pathExtension.lowercased()
                if ["crdownload", "download", "part", "tmp"].contains(ext) { continue }
                if onlyDocs && !docExt.contains(ext) { continue }
                let c = v?.creationDate ?? .distantPast, m = v?.contentModificationDate ?? .distantPast
                let made = c >= start && c < end, changed = m >= start && m < end
                guard made || changed else { continue }
                let t = made ? c : m
                let rel = u.deletingLastPathComponent().path.replacingOccurrences(of: home.path + "/", with: "")
                let size = sizeLabel(Int64(v?.fileSize ?? 0))
                out.append(Jejak(id: stableId("l", u.path), src: "lokal", ts: t, judul: u.lastPathComponent,
                                 teks: "\(made ? "Disimpan" : "Diubah") di \(rel) · \(size)", path: u.path))
            }
        }
        return Array(out.sorted { $0.ts > $1.ts }.prefix(30))
    }
}

enum JejakReader {
    static func read(_ ymd: String, sources: [String: Bool]) -> [[String: Any]] {
        var all: [Jejak] = []
        let on: (String) -> Bool = { sources[$0] ?? true }
        if on("claude") || on("figma") { all += ClaudeReader.read(ymd).filter { on($0.src) } }
        if on("web") || on("figma") { all += BrowserReader.read(ymd).filter { on($0.src) } }
        if on("lokal") { all += LocalReader.read(ymd) }
        return all.sorted { $0.ts < $1.ts }.map { $0.dict }
    }
}

// MARK: - Menjalankan claude -p

enum ClaudeRunner {
    static func findClaude() -> String? {
        [home.appendingPathComponent(".local/bin/claude").path, home.appendingPathComponent(".claude/local/claude").path,
         "/opt/homebrew/bin/claude", "/usr/local/bin/claude", home.appendingPathComponent(".npm-global/bin/claude").path]
            .first { fm.isExecutableFile(atPath: $0) }
    }

    /// `readDir` diisi → Claude boleh memakai alat Read, hanya di folder itu (untuk foto/file lampiran).
    static func run(prompt: String, model: String, readDir: String? = nil, timeout: TimeInterval = 240,
                    done: @escaping (_ ok: Bool, _ text: String, _ err: String) -> Void) {
        guard let bin = findClaude() else { done(false, "", "NO_CLI"); return }
        try? fm.createDirectory(at: genDir, withIntermediateDirectories: true)
        let p = Process()
        p.executableURL = URL(fileURLWithPath: bin)
        var args = ["-p", "--no-session-persistence", "--output-format", "text"]
        if let d = readDir { args += ["--tools", "Read", "--allowedTools", "Read", "--add-dir", d] } else { args += ["--tools", ""] }
        if !model.isEmpty { args += ["--model", model] }
        p.arguments = args
        p.currentDirectoryURL = genDir
        var env = ProcessInfo.processInfo.environment
        env["PATH"] = ["/usr/local/bin", "/opt/homebrew/bin", home.appendingPathComponent(".local/bin").path, "/usr/bin", "/bin", "/usr/sbin", "/sbin"].joined(separator: ":")
        env["USER"] = env["USER"] ?? NSUserName(); env["LOGNAME"] = env["LOGNAME"] ?? NSUserName(); env["HOME"] = home.path
        for k in env.keys where k.hasPrefix("CLAUDE_CODE_") || k == "CLAUDECODE" { env.removeValue(forKey: k) }
        p.environment = env
        let inPipe = Pipe(), outPipe = Pipe(), errPipe = Pipe()
        p.standardInput = inPipe; p.standardOutput = outPipe; p.standardError = errPipe
        var outData = Data(), errData = Data(); let lock = NSLock()
        outPipe.fileHandleForReading.readabilityHandler = { h in let d = h.availableData; lock.lock(); outData.append(d); lock.unlock() }
        errPipe.fileHandleForReading.readabilityHandler = { h in let d = h.availableData; lock.lock(); errData.append(d); lock.unlock() }
        var finished = false
        p.terminationHandler = { proc in
            outPipe.fileHandleForReading.readabilityHandler = nil; errPipe.fileHandleForReading.readabilityHandler = nil
            lock.lock()
            outData.append(outPipe.fileHandleForReading.readDataToEndOfFile()); errData.append(errPipe.fileHandleForReading.readDataToEndOfFile())
            let out = String(data: outData, encoding: .utf8) ?? "", err = String(data: errData, encoding: .utf8) ?? ""
            lock.unlock()
            DispatchQueue.main.async {
                if finished { return }; finished = true
                if (out + err).lowercased().contains("not logged in") || (out + err).contains("/login") { done(false, out, "NOT_LOGGED_IN"); return }
                done(proc.terminationStatus == 0 && !out.isEmpty, out, err)
            }
        }
        do { try p.run() } catch { done(false, "", "RUN_FAILED: \(error.localizedDescription)"); return }
        inPipe.fileHandleForWriting.write(Data(prompt.utf8)); try? inPipe.fileHandleForWriting.close()
        DispatchQueue.main.asyncAfter(deadline: .now() + timeout) {
            if !finished && p.isRunning { finished = true; p.terminate(); done(false, "", "TIMEOUT") }
        }
    }
}

// MARK: - Rekam suara + transkripsi (Speech framework, audio tidak disimpan)
//
// Catatan perilaku Speech di macOS yang ditangani di sini:
// - SFSpeechRecognizer harus disimpan selama task berjalan; kalau hanya variabel lokal,
//   task bisa berhenti diam-diam dan tidak pernah mengirim teks.
// - Setelah jeda bicara, hasil bisa "mulai dari nol" (atau task selesai sendiri, batas ±1 menit).
//   Teks sebelumnya disimpan di `committed` dan task baru dibuka selama masih merekam.
// - Model on-device id-ID belum tentu terpasang walau `supportsOnDeviceRecognition` true:
//   kalau gagal sebelum ada teks, ulang sekali lewat server Apple.

final class Voice {
    let engine = AVAudioEngine()
    var recognizer: SFSpeechRecognizer?
    var req: SFSpeechAudioBufferRecognitionRequest?
    var task: SFSpeechRecognitionTask?
    var committed = ""          // teks dari segmen yang sudah selesai
    var partial = ""            // teks segmen yang sedang berjalan
    var onDevice = false
    var recording = false       // mikrofon masih aktif (belum Selesai/Batal)
    var gen = 0                 // penanda task; callback task lama diabaikan
    var openedAt = Date()
    var quickFails = 0          // task yang langsung gagal berturut-turut (cegah loop)
    var lastPush = Date.distantPast
    // Audio awal disimpan sampai teks pertama muncul, supaya bisa diputar ulang saat pindah ke server.
    private let lock = NSLock()
    private var early: [AVAudioPCMBuffer] = []
    private var earlyFrames: AVAudioFramePosition = 0
    private var keepEarly = true
    var level: Float = 0
    /// (teks, level, final, kodeError)
    var push: ((String, Float, Bool, String) -> Void)?

    var text: String { [committed, partial].filter { !$0.isEmpty }.joined(separator: " ") }

    func start(_ cb: @escaping (String?) -> Void) {
        SFSpeechRecognizer.requestAuthorization { st in
            DispatchQueue.main.async {
                guard st == .authorized else { cb(st == .restricted ? "SPEECH_RESTRICTED" : "SPEECH_DENIED"); return }
                AVCaptureDevice.requestAccess(for: .audio) { ok in
                    DispatchQueue.main.async {
                        guard ok else { cb("MIC_DENIED"); return }
                        cb(self.begin())
                    }
                }
            }
        }
    }

    private func begin() -> String? {
        cancel()
        guard let rec = SFSpeechRecognizer(locale: Locale(identifier: "id-ID")) else { return "SPEECH_UNAVAILABLE" }
        guard rec.isAvailable else { return "SPEECH_UNAVAILABLE" }
        recognizer = rec
        onDevice = rec.supportsOnDeviceRecognition
        committed = ""; partial = ""
        resetEarly(keep: true)
        let input = engine.inputNode
        let fmt = input.outputFormat(forBus: 0)
        guard fmt.sampleRate > 0, fmt.channelCount > 0 else { return "MIC_FAILED" }
        input.removeTap(onBus: 0)
        input.installTap(onBus: 0, bufferSize: 1024, format: fmt) { [weak self] buf, _ in
            guard let self = self else { return }
            self.feed(buf)
            if let ch = buf.floatChannelData?[0] {
                var sum: Float = 0
                let n = Int(buf.frameLength)
                for i in 0..<n { sum += ch[i] * ch[i] }
                let rms = sqrt(sum / Float(max(n, 1)))
                DispatchQueue.main.async {
                    self.level = min(1, rms * 12)
                    if Date().timeIntervalSince(self.lastPush) > 0.12 { self.lastPush = Date(); self.push?(self.text, self.level, false, "") }
                }
            }
        }
        engine.prepare()
        do { try engine.start() } catch { input.removeTap(onBus: 0); return "MIC_FAILED" }
        recording = true
        quickFails = 0
        openTask()
        return nil
    }

    private func feed(_ buf: AVAudioPCMBuffer) {
        lock.lock()
        if keepEarly, earlyFrames < AVAudioFramePosition(buf.format.sampleRate * 20) {
            early.append(buf); earlyFrames += AVAudioFramePosition(buf.frameLength)
        }
        let r = req
        lock.unlock()
        r?.append(buf)
    }

    private func resetEarly(keep: Bool) {
        lock.lock(); early = []; earlyFrames = 0; keepEarly = keep; lock.unlock()
    }

    /// Buka task pengenalan baru. Dipanggil saat mulai, setelah segmen selesai, atau untuk ulang lewat server.
    private func openTask(replay: Bool = false) {
        guard let rec = recognizer else { return }
        gen += 1
        let my = gen
        openedAt = Date()
        let r = SFSpeechAudioBufferRecognitionRequest()
        r.shouldReportPartialResults = true
        r.requiresOnDeviceRecognition = onDevice
        if #available(macOS 13, *) { r.addsPunctuation = true }
        lock.lock()
        for b in early where replay { r.append(b) }   // pindah ke server: putar ulang audio awal
        req = r
        lock.unlock()
        task = rec.recognitionTask(with: r) { [weak self] res, err in
            DispatchQueue.main.async { self?.handle(my, res, err) }
        }
    }

    private func handle(_ my: Int, _ res: SFSpeechRecognitionResult?, _ err: Error?) {
        guard my == gen else { return }
        if let res = res {
            let s = res.bestTranscription.formattedString
            // Hasil mulai dari nol setelah jeda: simpan segmen sebelumnya.
            if !partial.isEmpty, !s.isEmpty, s.count < partial.count, !partial.lowercased().hasPrefix(s.lowercased().prefix(8)) {
                commitPartial()
            }
            if !s.isEmpty { resetEarly(keep: false) }
            partial = s
            if res.isFinal { commitPartial() }
            push?(text, level, false, "")
        }
        let ended = (res?.isFinal ?? false) || err != nil
        guard ended else { return }
        if let err = err, text.isEmpty, !isNoSpeech(err) {
            // Gagal sebelum ada teks. On-device belum siap → coba sekali lewat server Apple.
            if onDevice && recording { onDevice = false; openTask(replay: true); return }
            if recording || task != nil { push?("", 0, true, code(err)); hardStop(); return }
        }
        if recording {
            if err != nil, Date().timeIntervalSince(openedAt) < 1.5 { quickFails += 1 } else { quickFails = 0 }
            if quickFails >= 3 { push?(text, 0, true, text.isEmpty ? code(err!) : ""); hardStop(); return }
            openTask()           // masih merekam: lanjut segmen berikutnya
        } else {
            task = nil; req = nil
            push?(text, 0, true, "")
        }
    }

    private func commitPartial() {
        let p = partial.trimmingCharacters(in: .whitespaces)
        if !p.isEmpty { committed = committed.isEmpty ? p : committed + " " + p }
        partial = ""
    }

    private func isNoSpeech(_ e: Error) -> Bool {
        let n = e as NSError
        return n.domain == "kAFAssistantErrorDomain" && [1110, 216, 209].contains(n.code)
    }

    private func code(_ e: Error) -> String {
        let n = e as NSError
        let msg = n.localizedDescription.lowercased()
        if msg.contains("siri") || msg.contains("dictation") || msg.contains("dikte") || [1101, 1700].contains(n.code) { return "SPEECH_DICTATION_OFF" }
        if msg.contains("network") || msg.contains("internet") || msg.contains("jaringan") || [1107, 203, 301].contains(n.code) { return "SPEECH_NETWORK" }
        NSLog("Katnis suara: \(n.domain) \(n.code) \(n.localizedDescription)")
        return "SPEECH_FAILED"
    }

    private func hardStop() {
        recording = false
        if engine.isRunning { engine.stop() }
        engine.inputNode.removeTap(onBus: 0)
        gen += 1
        task?.cancel(); task = nil; req = nil
    }

    func stop() {
        guard recording else { push?(text, 0, true, ""); return }
        recording = false
        if engine.isRunning { engine.stop() }
        engine.inputNode.removeTap(onBus: 0)
        req?.endAudio()
        let my = gen
        // Batas tunggu kalau task tidak pernah mengirim hasil akhir.
        DispatchQueue.main.asyncAfter(deadline: .now() + 2.5) { [weak self] in
            guard let self = self, my == self.gen else { return }
            self.gen += 1
            self.commitPartial()
            self.task?.finish(); self.task = nil; self.req = nil
            self.push?(self.text, 0, true, "")
        }
    }

    func cancel() {
        hardStop()
        committed = ""; partial = ""
        resetEarly(keep: false)
    }

    // MARK: Mode uji: jalur rekam yang sama, tapi audio dari file (pengganti mikrofon), kecepatan waktu nyata
    func simulate(_ url: URL, done: @escaping (String, String) -> Void) {
        SFSpeechRecognizer.requestAuthorization { _ in DispatchQueue.main.async {
            guard let rec = SFSpeechRecognizer(locale: Locale(identifier: "id-ID")), let file = try? AVAudioFile(forReading: url) else { done("", "setup"); return }
            self.recognizer = rec; self.onDevice = rec.supportsOnDeviceRecognition
            self.committed = ""; self.partial = ""; self.recording = true; self.quickFails = 0; self.resetEarly(keep: true)
            var lastErr = ""
            self.push = { t, _, final, e in if !e.isEmpty { lastErr = e }; if final { done(t, lastErr) } }
            self.openTask()
            let fmt = file.processingFormat, chunk: AVAudioFrameCount = 4096
            func feed() {
                guard self.recording else { return }
                guard let b = AVAudioPCMBuffer(pcmFormat: fmt, frameCapacity: chunk), (try? file.read(into: b, frameCount: chunk)) != nil, b.frameLength > 0 else {
                    DispatchQueue.main.asyncAfter(deadline: .now() + 1) { self.stop() }; return
                }
                self.feed(b)
                DispatchQueue.main.asyncAfter(deadline: .now() + Double(b.frameLength) / fmt.sampleRate) { feed() }
            }
            feed()
        } }
    }

    // MARK: Mode uji: transkripsi file audio dengan pengaturan yang sama (id-ID, on-device bila ada)
    static func transcribeFile(_ url: URL, onDevice: Bool?, done: @escaping (String, String) -> Void) {
        SFSpeechRecognizer.requestAuthorization { st in
            guard st == .authorized else { done("", "izin Pengenalan Ucapan: \(st.rawValue)"); return }
            guard let rec = SFSpeechRecognizer(locale: Locale(identifier: "id-ID")) else { done("", "id-ID tidak didukung"); return }
            let r = SFSpeechURLRecognitionRequest(url: url)
            r.requiresOnDeviceRecognition = onDevice ?? rec.supportsOnDeviceRecognition
            var t: SFSpeechRecognitionTask?
            t = rec.recognitionTask(with: r) { res, err in
                if let err = err as NSError? { done(res?.bestTranscription.formattedString ?? "", "\(err.domain) \(err.code) \(err.localizedDescription)"); _ = t; return }
                if let res = res, res.isFinal { done(res.bestTranscription.formattedString, ""); _ = t; _ = rec }
            }
            _ = t
        }
    }
}

// MARK: - Jembatan JS ⇄ Swift

final class Bridge: NSObject, WKScriptMessageHandlerWithReply {
    weak var webView: WKWebView?
    let voice = Voice()

    func js(_ s: String) { webView?.evaluateJavaScript(s) }

    func userContentController(_ ucc: WKUserContentController, didReceive message: WKScriptMessage,
                               replyHandler: @escaping (Any?, String?) -> Void) {
        guard let body = message.body as? [String: Any], let action = body["action"] as? String else { replyHandler(nil, "bad message"); return }
        switch action {
        case "load":
            if let d = try? Data(contentsOf: storeURL), let s = String(data: d, encoding: .utf8) { replyHandler(s, nil) } else { replyHandler("", nil) }
        case "save":
            do {
                try fm.createDirectory(at: supportDir, withIntermediateDirectories: true)
                try Data((body["data"] as? String ?? "{}").utf8).write(to: storeURL, options: .atomic)
                replyHandler(true, nil)
            } catch { replyHandler(nil, error.localizedDescription) }
        case "jejak":
            let day = body["day"] as? String ?? ""
            let src = body["sources"] as? [String: Bool] ?? [:]
            DispatchQueue.global(qos: .userInitiated).async {
                let r = JejakReader.read(day, sources: src)
                DispatchQueue.main.async { replyHandler(r, nil) }
            }
        case "claude":
            let read = body["read"] as? Bool ?? false
            ClaudeRunner.run(prompt: body["prompt"] as? String ?? "", model: body["model"] as? String ?? "sonnet",
                             readDir: read ? lampDir.path : nil) { ok, text, err in
                replyHandler(["ok": ok, "text": text, "error": err], nil)
            }
        case "hasClaude":
            replyHandler(ClaudeRunner.findClaude() != nil, nil)
        case "copy":
            NSPasteboard.general.clearContents()
            NSPasteboard.general.setString(body["text"] as? String ?? "", forType: .string)
            replyHandler(true, nil)
        case "open":
            if let s = body["url"] as? String, let u = URL(string: s), ["http", "https", "figma"].contains(u.scheme ?? "") { NSWorkspace.shared.open(u) }
            replyHandler(true, nil)
        case "openPath":
            if let p = body["path"] as? String, fm.fileExists(atPath: p) { NSWorkspace.shared.open(URL(fileURLWithPath: p)) }
            replyHandler(true, nil)
        case "pickFile":
            let day = body["day"] as? String ?? "lain"
            let panel = NSOpenPanel()
            panel.canChooseFiles = true; panel.canChooseDirectories = false; panel.allowsMultipleSelection = false
            if body["image"] as? Bool == true { panel.allowedContentTypes = [.image] }
            panel.begin { res in
                guard res == .OK, let src = panel.url else { replyHandler(nil, nil); return }
                let size = (try? src.resourceValues(forKeys: [.fileSizeKey]).fileSize) ?? 0
                if size > 25 * 1024 * 1024 { replyHandler(["error": "TOO_BIG"], nil); return }
                let dir = lampDir.appendingPathComponent(day, isDirectory: true)
                try? fm.createDirectory(at: dir, withIntermediateDirectories: true)
                var dst = dir.appendingPathComponent(src.lastPathComponent)
                var n = 2
                while fm.fileExists(atPath: dst.path) {
                    dst = dir.appendingPathComponent("\(src.deletingPathExtension().lastPathComponent) \(n).\(src.pathExtension)"); n += 1
                }
                do { try fm.copyItem(at: src, to: dst) } catch { replyHandler(["error": error.localizedDescription], nil); return }
                replyHandler(["path": dst.path, "name": src.lastPathComponent, "size": sizeLabel(Int64(size))], nil)
            }
        case "savePhoto":
            let day = body["day"] as? String ?? "lain"
            let b64 = (body["data"] as? String ?? "").components(separatedBy: ",").last ?? ""
            guard let data = Data(base64Encoded: b64) else { replyHandler(["error": "BAD_IMAGE"], nil); return }
            let dir = lampDir.appendingPathComponent(day, isDirectory: true)
            try? fm.createDirectory(at: dir, withIntermediateDirectories: true)
            let f = DateFormatter(); f.dateFormat = "HH.mm.ss"
            let dst = dir.appendingPathComponent("Foto \(f.string(from: Date())).jpg")
            do { try data.write(to: dst); replyHandler(["path": dst.path, "name": dst.lastPathComponent, "size": sizeLabel(Int64(data.count))], nil) }
            catch { replyHandler(["error": error.localizedDescription], nil) }
        case "removeFile":
            if let p = body["path"] as? String, p.hasPrefix(lampDir.path) { try? fm.removeItem(atPath: p) }
            replyHandler(true, nil)
        case "voiceStart":
            voice.push = { [weak self] text, level, final, err in
                let payload = (try? JSONSerialization.data(withJSONObject: ["text": text, "level": level, "final": final, "error": err])).flatMap { String(data: $0, encoding: .utf8) } ?? "{}"
                self?.js("window.Katnis&&Katnis.voice(\(payload))")
            }
            voice.start { err in replyHandler(["error": err ?? ""], nil) }
        case "voiceStop":
            voice.stop(); replyHandler(true, nil)
        case "voiceCancel":
            voice.cancel(); replyHandler(true, nil)
        case "openData":
            NSWorkspace.shared.activateFileViewerSelecting([storeURL]); replyHandler(true, nil)
        case "log":
            FileHandle.standardError.write(Data(("[js] " + (body["msg"] as? String ?? "") + "\n").utf8)); replyHandler(true, nil)
        default:
            replyHandler(nil, "unknown action \(action)")
        }
    }
}

// MARK: - Jendela & app

final class AppDelegate: NSObject, NSApplicationDelegate, WKNavigationDelegate, WKUIDelegate {
    var window: NSWindow!
    var webView: WKWebView!
    let bridge = Bridge()

    func applicationDidFinishLaunching(_ n: Notification) {
        for d in [genDir, lampDir, tmpDir] { try? fm.createDirectory(at: d, withIntermediateDirectories: true) }
        buildMenu()
        let cfg = WKWebViewConfiguration()
        cfg.userContentController.addScriptMessageHandler(bridge, contentWorld: .page, name: "bridge")
        cfg.preferences.setValue(true, forKey: "developerExtrasEnabled")
        cfg.mediaTypesRequiringUserActionForPlayback = []
        let errJS = "window.addEventListener('error',e=>window.webkit.messageHandlers.bridge.postMessage({action:'log',msg:String(e.message)+' @'+e.lineno}));window.addEventListener('unhandledrejection',e=>window.webkit.messageHandlers.bridge.postMessage({action:'log',msg:'reject '+String(e.reason)}));"
        cfg.userContentController.addUserScript(WKUserScript(source: errJS, injectionTime: .atDocumentStart, forMainFrameOnly: true))
        if CommandLine.arguments.contains("--demo") {
            cfg.userContentController.addUserScript(WKUserScript(source: "window.KATNIS_DEMO=true", injectionTime: .atDocumentStart, forMainFrameOnly: true))
        }
        webView = WKWebView(frame: .zero, configuration: cfg)
        webView.navigationDelegate = self; webView.uiDelegate = self
        webView.setValue(false, forKey: "drawsBackground")
        bridge.webView = webView

        let bg = NSColor(name: nil) { ap in
            ap.bestMatch(from: [.darkAqua, .aqua]) == .darkAqua
                ? NSColor(srgbRed: 0x06/255, green: 0x10/255, blue: 0x0D/255, alpha: 1)
                : NSColor(srgbRed: 0xE8/255, green: 0xF1/255, blue: 0xED/255, alpha: 1)
        }
        window = NSWindow(contentRect: NSRect(x: 0, y: 0, width: 1360, height: 880),
                          styleMask: [.titled, .closable, .miniaturizable, .resizable, .fullSizeContentView], backing: .buffered, defer: false)
        window.title = appName
        window.titlebarAppearsTransparent = true
        window.titleVisibility = .hidden
        window.backgroundColor = bg
        window.minSize = NSSize(width: 820, height: 600)
        window.contentView = webView
        window.setFrameAutosaveName("MainWindow")
        if !window.setFrameUsingName("MainWindow") { window.center() }
        window.makeKeyAndOrderFront(nil)

        let res = Bundle.main.resourceURL!.appendingPathComponent("web", isDirectory: true)
        webView.loadFileURL(res.appendingPathComponent("index.html"), allowingReadAccessTo: res)
        NSApp.activate(ignoringOtherApps: true)
        NotificationCenter.default.addObserver(forName: NSApplication.didBecomeActiveNotification, object: nil, queue: .main) { [weak self] _ in
            self?.send("window.Katnis&&Katnis.onFocus()")
        }

        // Mode uji: --snapshot <file.png> [--js "<kode>"] [--wait detik]
        let a = CommandLine.arguments
        if let i = a.firstIndex(of: "--snapshot"), i + 1 < a.count {
            let out = a[i + 1]
            let jsCode = a.firstIndex(of: "--js").flatMap { $0 + 1 < a.count ? a[$0 + 1] : nil }
            let wait = a.firstIndex(of: "--wait").flatMap { $0 + 1 < a.count ? Double(a[$0 + 1]) : nil } ?? 3
            DispatchQueue.main.asyncAfter(deadline: .now() + 2) {
                if let j = jsCode { self.webView.evaluateJavaScript(j) }
                DispatchQueue.main.asyncAfter(deadline: .now() + wait) {
                    self.webView.takeSnapshot(with: nil) { img, _ in
                        if let img = img, let tiff = img.tiffRepresentation, let rep = NSBitmapImageRep(data: tiff),
                           let png = rep.representation(using: .png, properties: [:]) { try? png.write(to: URL(fileURLWithPath: out)) }
                        NSApp.terminate(nil)
                    }
                }
            }
        }
    }

    func applicationShouldTerminateAfterLastWindowClosed(_ s: NSApplication) -> Bool { false }
    func applicationShouldHandleReopen(_ s: NSApplication, hasVisibleWindows: Bool) -> Bool {
        if !hasVisibleWindows { window.makeKeyAndOrderFront(nil) }
        return true
    }

    func webView(_ w: WKWebView, decidePolicyFor a: WKNavigationAction, decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
        if let u = a.request.url, u.scheme == "http" || u.scheme == "https" { NSWorkspace.shared.open(u); decisionHandler(.cancel); return }
        decisionHandler(.allow)
    }
    func webView(_ w: WKWebView, createWebViewWith c: WKWebViewConfiguration, for a: WKNavigationAction, windowFeatures: WKWindowFeatures) -> WKWebView? {
        if let u = a.request.url { NSWorkspace.shared.open(u) }
        return nil
    }
    // kamera untuk "Ambil foto"
    @available(macOS 12.0, *)
    func webView(_ webView: WKWebView, requestMediaCapturePermissionFor origin: WKSecurityOrigin, initiatedByFrame frame: WKFrameInfo,
                 type: WKMediaCaptureType, decisionHandler: @escaping (WKPermissionDecision) -> Void) {
        decisionHandler(.grant)
    }
    func webView(_ w: WKWebView, runJavaScriptConfirmPanelWithMessage m: String, initiatedByFrame f: WKFrameInfo, completionHandler: @escaping (Bool) -> Void) {
        let al = NSAlert(); al.messageText = m; al.addButton(withTitle: "Ya"); al.addButton(withTitle: "Batal")
        completionHandler(al.runModal() == .alertFirstButtonReturn)
    }

    func send(_ s: String) { webView.evaluateJavaScript(s) }
    @objc func menuGenerate() { send("window.Katnis&&Katnis.genToday()") }
    @objc func menuToday() { send("window.Katnis&&Katnis.goToday()") }
    @objc func menuVoice() { send("window.Katnis&&Katnis.openCap('suara')") }
    @objc func menuPhoto() { send("window.Katnis&&Katnis.openCap('foto')") }
    @objc func menuFile() { send("window.Katnis&&Katnis.openCap('file')") }
    @objc func menuChat() { send("window.Katnis&&Katnis.openCap('chat')") }
    @objc func menuCopy() { send("window.Katnis&&Katnis.copyToday()") }
    @objc func menuPanel() { send("window.Katnis&&Katnis.togglePanel()") }
    @objc func menuReload() { webView.reload() }
    @objc func menuData() { NSWorkspace.shared.activateFileViewerSelecting([storeURL]) }

    func buildMenu() {
        let main = NSMenu()
        let appItem = NSMenuItem(); main.addItem(appItem)
        let appMenu = NSMenu()
        appMenu.addItem(withTitle: "Tentang \(appName)", action: #selector(NSApplication.orderFrontStandardAboutPanel(_:)), keyEquivalent: "")
        appMenu.addItem(.separator())
        let d = appMenu.addItem(withTitle: "Buka folder data", action: #selector(menuData), keyEquivalent: ""); d.target = self
        appMenu.addItem(.separator())
        appMenu.addItem(withTitle: "Sembunyikan \(appName)", action: #selector(NSApplication.hide(_:)), keyEquivalent: "h")
        appMenu.addItem(.separator())
        appMenu.addItem(withTitle: "Keluar dari \(appName)", action: #selector(NSApplication.terminate(_:)), keyEquivalent: "q")
        appItem.submenu = appMenu

        let editItem = NSMenuItem(); main.addItem(editItem)
        let edit = NSMenu(title: "Edit")
        edit.addItem(withTitle: "Urungkan", action: Selector(("undo:")), keyEquivalent: "z")
        edit.addItem(withTitle: "Ulangi", action: Selector(("redo:")), keyEquivalent: "Z")
        edit.addItem(.separator())
        edit.addItem(withTitle: "Potong", action: #selector(NSText.cut(_:)), keyEquivalent: "x")
        edit.addItem(withTitle: "Salin", action: #selector(NSText.copy(_:)), keyEquivalent: "c")
        edit.addItem(withTitle: "Tempel", action: #selector(NSText.paste(_:)), keyEquivalent: "v")
        edit.addItem(withTitle: "Pilih Semua", action: #selector(NSText.selectAll(_:)), keyEquivalent: "a")
        editItem.submenu = edit

        let noteItem = NSMenuItem(); main.addItem(noteItem)
        let note = NSMenu(title: "Catatan")
        func add(_ t: String, _ s: Selector, _ k: String, _ mods: NSEvent.ModifierFlags = .command) {
            let i = note.addItem(withTitle: t, action: s, keyEquivalent: k); i.target = self; i.keyEquivalentModifierMask = mods
        }
        add("Generate catatan hari ini", #selector(menuGenerate), "g")
        add("Salin teks standup hari ini", #selector(menuCopy), "c", [.command, .shift])
        add("Ke hari ini", #selector(menuToday), "t")
        note.addItem(.separator())
        add("Rekam suara…", #selector(menuVoice), "1", [.command, .option])
        add("Ambil foto…", #selector(menuPhoto), "2", [.command, .option])
        add("Upload file…", #selector(menuFile), "3", [.command, .option])
        add("Tempel chat…", #selector(menuChat), "4", [.command, .option])
        note.addItem(.separator())
        add("Sumber & blocker", #selector(menuPanel), "b", [.command, .shift])
        add("Muat ulang tampilan", #selector(menuReload), "r")
        noteItem.submenu = note

        let winItem = NSMenuItem(); main.addItem(winItem)
        let win = NSMenu(title: "Jendela")
        win.addItem(withTitle: "Kecilkan", action: #selector(NSWindow.performMiniaturize(_:)), keyEquivalent: "m")
        win.addItem(withTitle: "Tutup", action: #selector(NSWindow.performClose(_:)), keyEquivalent: "w")
        winItem.submenu = win
        NSApp.windowsMenu = win
        NSApp.mainMenu = main
    }
}

// Mode uji dari Terminal:  Katnis --jejak 2026-11-19
let cli = CommandLine.arguments
if let i = cli.firstIndex(of: "--jejak"), i + 1 < cli.count {
    var src: [String: Bool] = [:]
    if let j = cli.firstIndex(of: "--only"), j + 1 < cli.count {
        let on = Set(cli[j + 1].split(separator: ",").map(String.init))
        for k in ["claude", "figma", "web", "lokal"] { src[k] = on.contains(k) }
    }
    let r = JejakReader.read(cli[i + 1], sources: src)
    let d = try! JSONSerialization.data(withJSONObject: r, options: [.prettyPrinted, .sortedKeys])
    print(String(data: d, encoding: .utf8)!)
    exit(0)
}

// Mode uji suara tanpa mikrofon. Jalankan lewat `open -n -W -a Katnis.app --args ...`
// supaya izin Pengenalan Ucapan tercatat atas nama Katnis, bukan Terminal.
//   --tes-rekam <file> --out <hasil.txt>          jalur rekam (streaming) dengan audio dari file
//   --tes-suara <file> --out <hasil.txt> [--server]   transkripsi file sekali jalan
func arg(_ k: String) -> String? { cli.firstIndex(of: k).flatMap { $0 + 1 < cli.count ? cli[$0 + 1] : nil } }
func tulisHasil(_ s: String) { print(s, terminator: ""); if let o = arg("--out") { try? s.write(toFile: o, atomically: true, encoding: .utf8) } }
if let f = arg("--tes-rekam") {
    let v = Voice()
    v.simulate(URL(fileURLWithPath: f)) { text, err in
        tulisHasil("teks: \(text)\nerror: \(err)\nonDevice akhir: \(v.onDevice)\n"); exit(text.isEmpty ? 1 : 0)
    }
    DispatchQueue.main.asyncAfter(deadline: .now() + 150) { tulisHasil("timeout\n"); exit(3) }
    RunLoop.main.run()
}
if let f = arg("--tes-suara") {
    Voice.transcribeFile(URL(fileURLWithPath: f), onDevice: cli.contains("--server") ? false : nil) { text, err in
        tulisHasil("teks: \(text)\nerror: \(err)\n"); exit(err.isEmpty ? 0 : 1)
    }
    DispatchQueue.main.asyncAfter(deadline: .now() + 60) { tulisHasil("timeout\n"); exit(3) }
    RunLoop.main.run()
}

let app = NSApplication.shared
let delegate = AppDelegate()
app.delegate = delegate
app.setActivationPolicy(.regular)
app.run()
