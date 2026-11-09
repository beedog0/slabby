// Your profile as other people see it: the same display case a visitor gets, built live from this
// phone, with what you've chosen to show (Sharing settings). One button: Share profile.

import { router } from 'expo-router';
import { useMemo } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ProfileCase } from '../src/components/profile/ProfileCase';
import { BackIcon, IconButton, PrimaryButton } from '../src/components/ui';
import { AUDIENCE_LABEL } from '../src/profile/publicProfile';
import { myShowcase } from '../src/services/friends';
import { useDisplay } from '../src/store/display';
import { usePrices } from '../src/store/prices';
import { useProfile } from '../src/store/profile';
import { useRules } from '../src/store/rules';
import { useSharing } from '../src/store/sharing';
import { useVault } from '../src/store/vault';
import { size, space, type } from '../src/theme/tokens';
import { useColors } from '../src/theme/theme';

export default function PreviewProfile() {
  const color = useColors();
  const insets = useSafeAreaInsets();
  const profile = useProfile();
  const sharing = useSharing();
  const cards = useVault((s) => s.cards);
  const rules = useRules((s) => s.rules);
  const prices = usePrices((s) => s.byKey);
  const shelfOrder = useDisplay((s) => s.order);
  const pinnedId = useDisplay((s) => s.pinnedId);
  const showcase = useMemo(() => myShowcase(), [cards, rules, prices, sharing.order, sharing.showValue, shelfOrder, pinnedId]);

  const who = AUDIENCE_LABEL[sharing.audience];
  return (
    <View style={{ flex: 1, backgroundColor: color.canvas }}>
      <View style={[styles.bar, { paddingTop: insets.top }]}>
        <IconButton label="Back" onPress={() => router.back()}>
          <BackIcon />
        </IconButton>
      </View>
      <ScrollView contentContainerStyle={{ paddingTop: space.s, paddingBottom: insets.bottom + space.xxxl }}>
        <ProfileCase
          profile={{
            userId: 'me',
            handle: profile.handle || 'yourhandle',
            name: profile.name,
            bio: profile.bio,
            photo: profile.photo,
            audience: sharing.audience,
            showcase: sharing.audience === 'nobody' ? null : showcase,
          }}
          action={<PrimaryButton title="Share profile" onPress={() => router.push('/share-profile')} />}
          note={
            <Text
              onPress={() => router.push('/settings/sharing')}
              style={[type.secondary, { color: color.secondary, textAlign: 'center', paddingHorizontal: space.gutter }]}
            >
              {sharing.audience === 'nobody' ? 'Your collection is hidden from everyone' : `${who} can see this`} ·{' '}
              <Text style={{ color: color.ink }}>Change</Text>
            </Text>
          }
          hiddenText="Only you can see your collection."
        />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: { minHeight: size.touch, flexDirection: 'row', paddingHorizontal: space.gutter - 10 },
});
