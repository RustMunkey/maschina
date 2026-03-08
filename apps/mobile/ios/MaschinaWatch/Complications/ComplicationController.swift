import ClockKit
import SwiftUI

class ComplicationController: NSObject, CLKComplicationDataSource {

    func getComplicationDescriptors(handler: @escaping ([CLKComplicationDescriptor]) -> Void) {
        let descriptor = CLKComplicationDescriptor(
            identifier: "io.maschina.complication",
            displayName: "Maschina",
            supportedFamilies: [
                .circularSmall,
                .modularSmall,
                .utilitarianSmall,
                .graphicCircular,
                .graphicCorner,
            ]
        )
        handler([descriptor])
    }

    func getCurrentTimelineEntry(
        for complication: CLKComplication,
        withHandler handler: @escaping (CLKComplicationTimelineEntry?) -> Void
    ) {
        let entry = makeEntry(for: complication, date: Date())
        handler(entry)
    }

    func getTimelineEntries(
        for complication: CLKComplication,
        after date: Date,
        limit: Int,
        withHandler handler: @escaping ([CLKComplicationTimelineEntry]?) -> Void
    ) {
        handler(nil)
    }

    // MARK: - Templates

    private func makeEntry(for complication: CLKComplication, date: Date) -> CLKComplicationTimelineEntry? {
        guard let template = makeTemplate(for: complication) else { return nil }
        return CLKComplicationTimelineEntry(date: date, complicationTemplate: template)
    }

    private func makeTemplate(for complication: CLKComplication) -> CLKComplicationTemplate? {
        switch complication.family {
        case .graphicCircular:
            let template = CLKComplicationTemplateGraphicCircularView(
                AgentCountComplicationView()
            )
            return template

        case .graphicCorner:
            let template = CLKComplicationTemplateGraphicCornerTextView(
                textProvider: CLKSimpleTextProvider(text: "M"),
                label: AgentCountComplicationView()
            )
            return template

        case .circularSmall:
            return CLKComplicationTemplateCircularSmallSimpleText(
                textProvider: CLKSimpleTextProvider(text: "M")
            )

        case .modularSmall:
            return CLKComplicationTemplateModularSmallSimpleText(
                textProvider: CLKSimpleTextProvider(text: "M")
            )

        case .utilitarianSmall:
            return CLKComplicationTemplateUtilitarianSmallFlat(
                textProvider: CLKSimpleTextProvider(text: "Maschina")
            )

        default:
            return nil
        }
    }
}

struct AgentCountComplicationView: View {
    var body: some View {
        ZStack {
            Circle().fill(Color.black)
            Image(systemName: "cpu")
                .font(.system(size: 14, weight: .medium))
                .foregroundStyle(.white)
        }
    }
}
