// A card's name with its language badge on the same line: "Greninja ex [JP]".
// English is the default, so it carries no badge. The badge is an ink outline, the same
// weight as a hairline, so a Japanese printing reads at a glance without adding color.
import { StyleSheet, Text, View, type StyleProp, type TextStyle } from 'react-native';
import { langTag } from '../lib/format';
import { radius, space, type } from '../theme/tokens';
import { themed } from '../theme/theme';

export function LangBadge({ language, large }: { language: string | null | undefined; large?: boolean }) {
  const styles = useStyles();
  const tag = langTag(language);
  if (!tag) return null;
  return (
    <View accessibilityLabel={tag} style={[styles.badge, large && styles.badgeLarge]}>
      <Text style={[styles.tag, large && styles.tagLarge]}>{tag}</Text>
    </View>
  );
}

type Props = {
  name: string;
  language: string | null | undefined;
  style: StyleProp<TextStyle>;
  numberOfLines?: number;
  /** For title-size names (card page, scan sheet). */
  large?: boolean;
  center?: boolean;
};

export function CardName({ name, language, style, numberOfLines = 1, large, center }: Props) {
  const styles = useStyles();
  return (
    <View style={[styles.row, center && { justifyContent: 'center' }]}>
      <Text numberOfLines={numberOfLines} style={[style, { flexShrink: 1 }]}>
        {name}
      </Text>
      <LangBadge language={language} large={large} />
    </View>
  );
}

const useStyles = themed((color) => StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: space.s, minWidth: 0 },
  badge: {
    borderWidth: 1,
    borderColor: color.ink,
    borderRadius: radius.badge,
    paddingHorizontal: space.xs,
    paddingVertical: 1,
  },
  badgeLarge: { paddingHorizontal: space.xs + 2, paddingVertical: 2, borderRadius: radius.badge + 1 },
  tag: { ...type.caption, fontWeight: '600', color: color.ink },
  tagLarge: { ...type.secondary, fontWeight: '600' },
}));
