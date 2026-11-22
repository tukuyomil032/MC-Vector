// SPDX-License-Identifier: GPL-3.0-or-later

import Foundation
import Testing

@testable import MCVectorCore

@Suite("Minecraft formatted text")
struct MinecraftTextTests {
    @Test func plainTextIsOneDefaultRun() {
        #expect(MinecraftText.lines("A Minecraft Server") == [[.init(text: "A Minecraft Server")]])
    }

    @Test func colorCodesStartNewRunsAndResetStyles() {
        let lines = MinecraftText.lines("§l§aHello §cWorld")
        #expect(
            lines == [[.init(text: "Hello ", color: 0x55FF55), .init(text: "World", color: 0xFF5555)]])
    }

    @Test func stylesStackUntilReset() {
        let lines = MinecraftText.lines("§6§lBold§r plain")
        #expect(lines == [[.init(text: "Bold", color: 0xFFAA00, bold: true), .init(text: " plain")]])
    }

    @Test func escapesFromThePropertiesFileAreRead() {
        let lines = MinecraftText.lines("\\u00A7bTop\\nBottom")
        #expect(lines == [[.init(text: "Top", color: 0x55FFFF)], [.init(text: "Bottom", color: 0x55FFFF)]])
    }

    @Test func obfuscatedAndUnknownCodesAreDropped() {
        #expect(MinecraftText.lines("§kx§zy") == [[.init(text: "xy")]])
    }
}

@Suite("Automatic backup schedule")
struct AutoBackupScheduleTests {
    private var calendar: Calendar {
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = TimeZone(identifier: "UTC")!
        return calendar
    }

    /// Wednesday 2026-11-18 10:00 UTC.
    private var now: Date {
        calendar.date(from: DateComponents(year: 2026, month: 11, day: 18, hour: 10))!
    }

    @Test func intervalCountsFromNow() {
        let runs = AutoBackupSchedule.nextRuns(
            type: .interval, intervalMinutes: 30, weekday: 0, time: "03:00", from: now, count: 3, calendar: calendar)
        #expect(runs == [1, 2, 3].map { now.addingTimeInterval(Double($0) * 1800) })
    }

    @Test func dailyRunsAtTheTimeFromTomorrowWhenTodayHasPassed() {
        let runs = AutoBackupSchedule.nextRuns(
            type: .daily, intervalMinutes: 60, weekday: 0, time: "03:30", from: now, count: 2, calendar: calendar)
        #expect(runs.map { calendar.component(.day, from: $0) } == [19, 20])
        #expect(
            runs.allSatisfy { calendar.component(.hour, from: $0) == 3 && calendar.component(.minute, from: $0) == 30 })
    }

    @Test func weeklyRunsOnTheWeekday() {
        // 5 = Friday.
        let runs = AutoBackupSchedule.nextRuns(
            type: .weekly, intervalMinutes: 60, weekday: 5, time: "12:00", from: now, count: 2, calendar: calendar)
        #expect(runs.map { calendar.component(.day, from: $0) } == [20, 27])
    }
}
