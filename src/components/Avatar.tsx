// Your profile photo in a circle, or the first letter of your name on a well when there's none.

import { Image, Text, View } from 'react-native';
import Svg, { Circle, Path } from 'react-native-svg';
import { type } from '../theme/tokens';
import { useColors } from '../theme/theme';

export function Avatar({ photo, letter, px }: { photo: string | null; letter: string; px: number }) {
  const color = useColors();
  return (
    <View
      style={{
        width: px,
        height: px,
        borderRadius: px / 2,
        backgroundColor: color.well,
        overflow: 'hidden',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      {photo ? (
        <Image source={{ uri: photo }} style={{ width: px, height: px }} accessibilityIgnoresInvertColors />
      ) : !letter ? (
        // No name yet: a quiet outline of a person.
        <Svg width={px * 0.5} height={px * 0.5} viewBox="0 0 24 24" fill="none" stroke={color.secondary} strokeWidth={1.5} strokeLinecap="round">
          <Circle cx={12} cy={8.5} r={3.75} />
          <Path d="M4.5 20.25c.9-3.6 3.9-5.75 7.5-5.75s6.6 2.15 7.5 5.75" />
        </Svg>
      ) : (
        <Text style={[type.title, { color: color.secondary, fontSize: px * 0.4 }]}>{letter}</Text>
      )}
    </View>
  );
}
