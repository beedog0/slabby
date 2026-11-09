import Svg, { Circle } from 'react-native-svg';
import { useColors } from '../../theme/theme';

/** The … button. */
export function MoreIcon() {
  const color = useColors();
  return (
    <Svg width={24} height={24} viewBox="0 0 24 24" fill={color.ink}>
      <Circle cx={5.5} cy={12} r={1.6} />
      <Circle cx={12} cy={12} r={1.6} />
      <Circle cx={18.5} cy={12} r={1.6} />
    </Svg>
  );
}
