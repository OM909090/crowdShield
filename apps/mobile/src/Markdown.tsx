import { Text, View } from "react-native";
import { COLORS, t } from "./theme";

/**
 * The narrow Markdown subset the assistant is allowed to emit, rendered as React
 * Native text nodes.
 *
 * The backend prompt pins the model to bold, italic, inline code, bullet and
 * numbered lists and `###` labels — so supporting exactly that is a small
 * function, and it means a reply arrives as formatted text instead of a wall
 * with literal asterisks in it. Same contract as the web renderer, different
 * primitives (there is no DOM here).
 */

/**
 * A FACTORY, not a shared instance.
 *
 * `inline` recurses for nested marks, and a `/g` regex carries mutable `lastIndex`
 * state — sharing one meant the inner call rewound the scan to 0 and the outer loop
 * matched the same text forever. On the web that froze the tab; here it would hang
 * the JS thread and the app with it.
 */
const inlineRegex = () => /\*\*([^*]+?)\*\*|\*([^*\n]+?)\*|`([^`\n]+?)`/g;

/** Split one line into styled spans. Recurses so **bold *and italic*** works. */
function inline(text: string, keyBase: string): React.ReactNode[] {
  const out: React.ReactNode[] = [];
  let last = 0;
  let n = 0;
  const re = inlineRegex();
  let match: RegExpExecArray | null;

  while ((match = re.exec(text)) !== null) {
    // A zero-length match would never advance the cursor.
    if (match[0].length === 0) {
      re.lastIndex += 1;
      continue;
    }
    if (match.index > last) out.push(text.slice(last, match.index));
    const key = `${keyBase}-${n++}`;
    const [, bold, italic, code] = match;

    if (bold !== undefined) {
      out.push(
        <Text key={key} style={{ fontWeight: "800", color: "#fff" }}>
          {inline(bold, key)}
        </Text>
      );
    } else if (italic !== undefined) {
      out.push(
        <Text key={key} style={{ fontStyle: "italic", color: "#e2e8f0" }}>
          {inline(italic, key)}
        </Text>
      );
    } else if (code !== undefined) {
      out.push(
        <Text key={key} style={{ color: COLORS.cyanLight, fontFamily: "monospace", fontSize: 12 }}>
          {code}
        </Text>
      );
    }
    last = match.index + match[0].length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

const BULLET = /^\s*[-*•]\s+(.*)$/;
const ORDERED = /^\s*(\d{1,2})[.)]\s+(.*)$/;
const HEADING = /^\s{0,3}#{1,6}\s+(.*)$/;

export function Markdown({ children }: { readonly children: string }) {
  const lines = String(children ?? "").replace(/\r\n?/g, "\n").split("\n");
  const blocks: React.ReactNode[] = [];
  let key = 0;

  for (const line of lines) {
    if (!line.trim()) continue;

    const heading = line.match(HEADING);
    if (heading?.[1]) {
      blocks.push(
        <Text key={`h${key++}`} style={[t.h3, { marginTop: 6 }]}>
          {inline(heading[1], `h${key}`)}
        </Text>
      );
      continue;
    }

    const bullet = line.match(BULLET);
    if (bullet?.[1]) {
      blocks.push(
        <View key={`b${key++}`} style={{ flexDirection: "row", gap: 7, paddingLeft: 2 }}>
          <Text style={{ color: COLORS.cyanLight, fontSize: 13, lineHeight: 20 }}>•</Text>
          <Text style={[t.body, { flex: 1, color: "#e6edf6" }]}>{inline(bullet[1], `b${key}`)}</Text>
        </View>
      );
      continue;
    }

    const ordered = line.match(ORDERED);
    if (ordered?.[2]) {
      blocks.push(
        <View key={`o${key++}`} style={{ flexDirection: "row", gap: 7, paddingLeft: 2 }}>
          <Text style={{ color: COLORS.cyanLight, fontSize: 13, lineHeight: 20, fontWeight: "700" }}>
            {ordered[1]}.
          </Text>
          <Text style={[t.body, { flex: 1, color: "#e6edf6" }]}>{inline(ordered[2], `o${key}`)}</Text>
        </View>
      );
      continue;
    }

    blocks.push(
      <Text key={`p${key++}`} style={[t.body, { color: "#e6edf6" }]}>
        {inline(line, `p${key}`)}
      </Text>
    );
  }

  return <View style={{ gap: 4 }}>{blocks}</View>;
}
