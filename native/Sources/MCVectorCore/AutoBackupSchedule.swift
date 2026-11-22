// SPDX-License-Identifier: GPL-3.0-or-later

import Foundation

/// When automatic backups run, for showing the next few on a timeline.
public enum AutoBackupSchedule {
    /// The next `count` run times after `now`.
    /// - `interval`: every `intervalMinutes`, counted from `now` (the core
    ///   counts from the last backup, which the preview does not know).
    /// - `daily`: every day at `time` ("HH:mm").
    /// - `weekly`: every week on `weekday` (0 = Sunday) at `time`.
    public static func nextRuns(
        type: AutoBackupScheduleType, intervalMinutes: UInt32, weekday: UInt8, time: String,
        from now: Date, count: Int, calendar: Calendar = .current
    ) -> [Date] {
        guard count > 0 else { return [] }
        switch type {
        case .interval:
            let step = TimeInterval(max(intervalMinutes, 1)) * 60
            return (1...count).map { now.addingTimeInterval(step * Double($0)) }
        case .daily, .weekly:
            let parts = time.split(separator: ":").compactMap { Int($0) }
            var components = DateComponents()
            components.hour = parts.first ?? 3
            components.minute = parts.count > 1 ? parts[1] : 0
            if type == .weekly { components.weekday = Int(weekday % 7) + 1 }
            var runs: [Date] = []
            var cursor = now
            while runs.count < count,
                let next = calendar.nextDate(after: cursor, matching: components, matchingPolicy: .nextTime)
            {
                runs.append(next)
                cursor = next
            }
            return runs
        }
    }
}
