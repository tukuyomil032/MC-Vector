// SPDX-License-Identifier: GPL-3.0-or-later

import GlassKit
import MCVectorCore
import SwiftUI

/// The next automatic backups on a line, so a schedule reads at a glance.
/// It follows the schedule fields as they are edited.
struct BackupTimeline: View {
    let type: AutoBackupScheduleType
    let intervalMinutes: UInt32
    let weekday: UInt8
    let time: String

    @Environment(\.locale) private var locale

    private var runs: [Date] {
        AutoBackupSchedule.nextRuns(
            type: type, intervalMinutes: intervalMinutes, weekday: weekday, time: time, from: .now, count: 4)
    }

    var body: some View {
        let runs = runs
        VStack(alignment: .leading, spacing: 8) {
            ZStack {
                Capsule().fill(.quaternary).frame(height: 3)
                HStack {
                    ForEach(Array(runs.enumerated()), id: \.offset) { index, _ in
                        if index > 0 { Spacer(minLength: 0) }
                        Circle()
                            .fill(index == 0 ? Color.accentColor : Color.accentColor.opacity(0.45))
                            .frame(width: 10, height: 10)
                            .overlay { Circle().strokeBorder(.background, lineWidth: 2) }
                    }
                }
            }
            HStack(alignment: .top) {
                ForEach(Array(runs.enumerated()), id: \.offset) { index, date in
                    if index > 0 { Spacer(minLength: 4) }
                    VStack(alignment: index == 0 ? .leading : index == runs.count - 1 ? .trailing : .center, spacing: 1)
                    {
                        Text(date, format: .dateTime.month(.abbreviated).day().weekday(.abbreviated).locale(locale))
                            .font(.caption2)
                            .foregroundStyle(.secondary)
                        Text(date, format: .dateTime.hour().minute().locale(locale))
                            .font(.caption.weight(index == 0 ? .semibold : .regular))
                            .monospacedDigit()
                    }
                }
            }
        }
        .padding(.vertical, 4)
        .animation(Motion.standard, value: runs)
        .accessibilityHidden(true)
    }
}
