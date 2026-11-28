// biome-ignore-all lint/suspicious/noArrayIndexKey: Static text fragments have no identity or component state.
import { Alert, Linking, StyleSheet, Text, View } from "react-native";
import { theme } from "../theme";

async function openLink(url: string) {
  try {
    await Linking.openURL(url);
  } catch {
    Alert.alert("Could not open link", "Try opening this link in your browser.");
  }
}

export function EventDescription({ description }: { description: string }) {
  return (
    <View style={s.content}>
      {description
        .replaceAll("\r", "")
        .split(/\n\s*\n/)
        .filter(Boolean)
        .map((paragraph, index) => (
          <Text
            key={`${index}:${paragraph}`}
            style={[s.text, /^#{1,6} /.test(paragraph) && s.heading]}
          >
            {paragraph
              .replace(/^#{1,6} /, "")
              .replace(/^[-*] /gm, "• ")
              .split(
                /(\*\*[^*]+\*\*|\[[^\]]+\]\(https?:\/\/[^\s)]+\)|https?:\/\/[^\s]+|\*[^*\n]+\*)/g,
              )
              .map((part, partIndex) => {
                const link = /^\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)$/.exec(part);
                if (link || /^https?:\/\//.test(part)) {
                  const url = link?.[2] ?? part;
                  return (
                    <Text
                      key={`${partIndex}:${part}`}
                      accessibilityRole="link"
                      style={s.link}
                      onPress={() => {
                        void openLink(url);
                      }}
                    >
                      {link?.[1] ?? part}
                    </Text>
                  );
                }
                if (part.startsWith("**") && part.endsWith("**"))
                  return (
                    <Text key={`${partIndex}:${part}`} style={s.bold}>
                      {part.slice(2, -2)}
                    </Text>
                  );
                if (part.startsWith("*") && part.endsWith("*"))
                  return (
                    <Text key={`${partIndex}:${part}`} style={s.italic}>
                      {part.slice(1, -1)}
                    </Text>
                  );
                return part;
              })}
          </Text>
        ))}
    </View>
  );
}
const s = StyleSheet.create({
  content: { gap: 14 },
  text: { color: theme.slate, fontSize: 17, lineHeight: 27 },
  heading: { fontSize: 20, fontWeight: "600" },
  bold: { fontWeight: "700" },
  italic: { fontStyle: "italic" },
  link: { color: theme.tealText },
});
