/**
 * Synthetic SwiftUI snippets for the heuristics, written for these tests. For every check:
 * `flag` snippets must produce at least one finding of that check, `clean` snippets none.
 */

export interface HeuristicFixture {
  flag: string[];
  clean: string[];
}

export const FIXTURES: Record<string, HeuristicFixture> = {
  'hit-target-size': {
    flag: [
      `Button("Go") { go() }
  .frame(width: 24, height: 24)`,
      `Button { share() } label: {
  Image(systemName: "square.and.arrow.up")
    .frame(width: 30, height: 30)
}
.accessibilityLabel("Share")`,
      `Link("Docs", destination: url).frame(width: 40, height: 20)`,
      `Text("Tap")
  .frame(width: 32, height: 32)
  .onTapGesture { tapped() }`,
      // Trailing closure on the next line (valid Swift).
      `Button(action: go)
{
  Image(systemName: "plus")
}
.frame(width: 20, height: 20)`,
      // contentShape does not enlarge a 20x20 target.
      `Button { go() } label: {
  Image(systemName: "plus")
    .frame(width: 20, height: 20)
    .contentShape(Rectangle())
}`,
      // label: passed as an argument closure.
      `Button(action: go, label: { Image(systemName: "plus").frame(width: 20, height: 20) })`,
      // Link(destination:) with a label closure.
      `Link(destination: url) {
  Image(systemName: "safari").frame(width: 20, height: 20)
}`,
      // Button-style Toggle with a label closure.
      `Toggle(isOn: $starred) {
  Image(systemName: "star").frame(width: 20, height: 20)
}
.toggleStyle(.button)`,
      // padding(1) makes it 22x22, still below 28x28.
      `Button { go() } label: {
  Image(systemName: "plus")
    .frame(width: 20, height: 20)
    .padding(1)
}`,
    ],
    clean: [
      // Decorative image, not tappable.
      `Image("leaf").frame(width: 30, height: 30)`,
      `Button("Go") { go() }.frame(width: 44, height: 44)`,
      // Label is small but padded and given a content shape.
      `Button { share() } label: {
  Image(systemName: "square.and.arrow.up")
    .frame(width: 20, height: 20)
    .padding(12)
    .contentShape(Rectangle())
}`,
      `Button("Wide") { go() }.frame(minWidth: 20, minHeight: 20)`,
      `Button(action: go, label: { Image(systemName: "plus").frame(width: 44, height: 44) })`,
      `Link(destination: url) {
  Image(systemName: "safari").frame(width: 44, height: 44)
}`,
      `Toggle(isOn: $starred) {
  Image(systemName: "star").frame(width: 44, height: 44)
}
.toggleStyle(.button)`,
      // Switch-style toggle: the switch is the control, not the label.
      `Toggle(isOn: $wifi) {
  Image(systemName: "wifi").frame(width: 20, height: 20)
}`,
      `Link("Docs", destination: url)`,
      // Nested frames don't establish the label's bounds (an HStack of two 24x44 views is wider).
      `Button { go() } label: {
  HStack(spacing: 8) {
    Image(systemName: "a").frame(width: 24, height: 44)
    Image(systemName: "b").frame(width: 24, height: 44)
  }
}`,
      // Commented-out code is ignored.
      `// Button("x") {}.frame(width: 10, height: 10)
Text("hi")`,
    ],
  },
  'fixed-font-size': {
    flag: [
      `Text("Title").font(.system(size: 22))`,
      `Text("Fixed").font(.custom("Avenir Next", fixedSize: 15))`,
      `label.font = UIFont.systemFont(ofSize: 15)`,
      `Text("Weighted").font(.system(size: 20, weight: .semibold))`,
    ],
    clean: [
      `Text("Body").font(.body)`,
      `Text("Custom").font(.custom("Avenir Next", size: 17))`,
      `Text("Custom").font(.custom("Avenir Next", size: 17, relativeTo: .headline))`,
      `@ScaledMetric(relativeTo: .body) var titleSize: CGFloat = 22
var body: some View { Text("Scaled").font(.system(size: titleSize)) }`,
      `let note = "use .font(.system(size: 12)) sparingly"`,
      `label.font = UIFontMetrics.default.scaledFont(for: UIFont.systemFont(ofSize: 15))`,
      // Wrapped across lines.
      `label.font = UIFontMetrics.default.scaledFont(
  for: UIFont.systemFont(ofSize: 15)
)`,
    ],
  },
  'font-below-minimum': {
    flag: [`Text("Fine print").font(.system(size: 9))`, `Text("Tiny").font(.custom("Avenir", size: 10))`],
    clean: [`Text("Caption").font(.system(size: 11))`, `Text("Caption").font(.caption2)`],
  },
  'hard-coded-color': {
    flag: [
      `Text("Hi").foregroundStyle(Color(red: 0.1, green: 0.2, blue: 0.3))`,
      `let brand = Color(hex: "#FF8800")`,
      `view.backgroundColor = UIColor(red: 1, green: 1, blue: 1, alpha: 1)`,
      `Text("Hi").foregroundColor(.black)`,
      `let c = Color(.sRGB, red: 0.5, green: 0.5, blue: 0.5)`,
    ],
    clean: [
      `Text("Hi").foregroundStyle(.secondary)`,
      `Rectangle().fill(Color("BrandColor"))`,
      `Text("Hi").foregroundStyle(Color.accentColor)`,
      `view.backgroundColor = .systemBackground`,
      `let doc = "Color(red: 1, green: 0, blue: 0)"`,
    ],
  },
  'icon-only-button-label': {
    flag: [
      `Button { delete() } label: {
  Image(systemName: "trash")
}`,
      `Button(action: favorite) {
  Image(systemName: "heart")
}`,
      `Button(action: { close() }, label: { Image(systemName: "xmark") })`,
    ],
    clean: [
      `Button { delete() } label: {
  Image(systemName: "trash")
}
.accessibilityLabel("Delete")`,
      `Button("Delete", systemImage: "trash") { delete() }`,
      `Button { delete() } label: {
  Label("Delete", systemImage: "trash")
}
.labelStyle(.iconOnly)`,
      `Button { play() } label: {
  HStack { Image(systemName: "play.fill"); Text("Play") }
}`,
      `Image(decorative: "divider")`,
    ],
  },
  'tap-gesture-as-button': {
    flag: [
      `HStack {
  Image(systemName: "star")
  Text("Favorites")
}
.onTapGesture { openFavorites() }`,
      `Text("More").onTapGesture { showMore = true }`,
    ],
    clean: [
      `Color.black.opacity(0.4).onTapGesture { dismiss() }`,
      `Image("photo").onTapGesture(count: 2) { like() }`,
      `Text("More")
  .onTapGesture { showMore = true }
  .accessibilityAddTraits(.isButton)`,
      `Button("More") { showMore = true }`,
    ],
  },
  'ignores-safe-area-content': {
    flag: [
      `VStack {
  Text("Header")
  Spacer()
}
.ignoresSafeArea()`,
      `ScrollView { content }.edgesIgnoringSafeArea(.all)`,
    ],
    clean: [
      `ZStack {
  Color.indigo.ignoresSafeArea()
  Text("Hello")
}`,
      `VStack { Text("Hi") }
  .background(Color.blue.ignoresSafeArea())`,
      `VStack { Text("Hi") }
  .background {
    LinearGradient(colors: [.blue, .purple], startPoint: .top, endPoint: .bottom)
      .ignoresSafeArea()
  }`,
      `Form { TextField("Name", text: $name) }.ignoresSafeArea(.keyboard)`,
      `Image("hero").resizable().scaledToFill().ignoresSafeArea()`,
    ],
  },
  'screen-bounds-layout': {
    flag: [
      `Text("Hi").frame(width: UIScreen.main.bounds.width * 0.8)`,
      `if UIDevice.current.orientation.isLandscape { HStack { a; b } } else { VStack { a; b } }`,
    ],
    clean: [
      `GeometryReader { proxy in Text("Hi").frame(width: proxy.size.width * 0.8) }`,
      `@Environment(\\.horizontalSizeClass) private var sizeClass`,
    ],
  },
  'alert-button-count': {
    flag: [
      // A Group is descended into: four buttons show at once.
      `.alert("Export", isPresented: $showing) {
  Group {
    Button("PDF") {}
    Button("PNG") {}
    Button("SVG") {}
    Button("Cancel", role: .cancel) {}
  }
}`,
      // Two always-shown buttons plus a branch that adds two more.
      `.alert("Sync", isPresented: $showing) {
  Button("Retry") { retry() }
  Button("Cancel", role: .cancel) {}
  if canExport {
    Button("Export") { export() }
    Button("Share") { share() }
  }
}`,
      `.alert("Save changes?", isPresented: $showing) {
  Button("Save") { save() }
  Button("Save As…") { saveAs() }
  Button("Discard", role: .destructive) { discard() }
  Button("Cancel", role: .cancel) {}
}`,
    ],
    clean: [
      `.alert("Delete photo?", isPresented: $showing) {
  Button("Delete", role: .destructive) { delete() }
  Button("Cancel", role: .cancel) {}
} message: {
  Text("This cannot be undone.")
}`,
      `.alert("Choose", isPresented: $showing) {
  ForEach(options) { option in Button(option.name) { pick(option) } }
}`,
      // Exclusive branches inside a Group.
      `.alert("Changes", isPresented: $showing) {
  Group {
    if editing {
      Button("Save") { save() }
      Button("Discard", role: .destructive) { discard() }
    } else {
      Button("Edit") { edit() }
      Button("Close", role: .cancel) {}
    }
  }
}`,
      // Exclusive branches in an actions: argument closure.
      `.alert("Changes", isPresented: $showing, actions: {
  if editing {
    Button("Save") { save() }
    Button("Discard", role: .destructive) { discard() }
  } else {
    Button("Edit") { edit() }
    Button("Close", role: .cancel) {}
  }
})`,
      // A closure inside the if condition is not the branch body.
      `.alert("Pick", isPresented: $showing) {
  if values.contains(where: { $0 > 1 }) {
    Button("A") {}
    Button("B") {}
  } else {
    Button("C") {}
    Button("D") {}
  }
}`,
      // Mutually exclusive branches: at most two buttons show at once.
      `.alert("Changes", isPresented: $showing) {
  if editing {
    Button("Save") { save() }
    Button("Discard", role: .destructive) { discard() }
  } else {
    Button("Edit") { edit() }
    Button("Close", role: .cancel) {}
  }
}`,
    ],
  },
  'segmented-count': {
    flag: [
      `Picker("Range", selection: $range) {
  Text("1D").tag(0); Text("1W").tag(1); Text("1M").tag(2)
  Text("3M").tag(3); Text("1Y").tag(4); Text("5Y").tag(5)
}
.pickerStyle(.segmented)`,
    ],
    clean: [
      `Picker("Range", selection: $range) {
  Text("Day").tag(0); Text("Week").tag(1); Text("Month").tag(2)
}
.pickerStyle(.segmented)`,
      `Picker("Range", selection: $range) {
  Text("1D").tag(0); Text("1W").tag(1); Text("1M").tag(2)
  Text("3M").tag(3); Text("1Y").tag(4); Text("5Y").tag(5)
}
.pickerStyle(.menu)`,
      // Exclusive branches inside a Group, four segments each.
      `Picker("Range", selection: $range) {
  Group {
    if intraday {
      Text("1H").tag(0); Text("4H").tag(1); Text("1D").tag(2); Text("1W").tag(3)
    } else {
      Text("1M").tag(0); Text("3M").tag(1); Text("1Y").tag(2); Text("5Y").tag(3)
    }
  }
}
.pickerStyle(.segmented)`,
      // Exclusive branches with four segments each.
      `Picker("Range", selection: $range) {
  if intraday {
    Text("1H").tag(0); Text("4H").tag(1); Text("1D").tag(2); Text("1W").tag(3)
  } else {
    Text("1M").tag(0); Text("3M").tag(1); Text("1Y").tag(2); Text("5Y").tag(3)
  }
}
.pickerStyle(.segmented)`,
    ],
  },
  'light-font-weight': {
    flag: [`Text("Thin").fontWeight(.thin)`, `Text("Light").font(.system(.body, weight: .ultraLight))`],
    clean: [`Text("Regular").fontWeight(.regular)`, `Text("Bold").font(.headline.weight(.bold))`],
  },
};
