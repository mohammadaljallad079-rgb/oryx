import React from 'react';
import { Linking, View } from 'react-native';

import { useApp } from '../lib/app-context';
import { ScreenHeader } from '../components/brand';
import { Body, Button, Card, Divider, Heading, Screen, SectionLabel } from '../components/ui';
import { space } from '../lib/theme';

/**
 * Support and about.
 *
 * The contact routes, the app version and the demo disclaimer. No form posts
 * anywhere, so the screen offers a phone number and an email address rather than
 * a message box that would silently discard what a customer typed.
 */
export default function Support() {
  const { t } = useApp();
  return (
    <Screen>
      <ScreenHeader title={t('support')} subtitle={t('supportHint')} />

      <Card>
        <SectionLabel>{t('support')}</SectionLabel>
        <View style={{ marginTop: space.md, gap: space.sm }}>
          <Button title="+973 1700 0000" variant="secondary" onPress={() => Linking.openURL('tel:+97317000000')} />
          <Button title="support@oryx.bh" variant="secondary" onPress={() => Linking.openURL('mailto:support@oryx.bh')} />
        </View>
      </Card>

      <Card>
        <Heading size="subheading">{t('aboutApp')}</Heading>
        <Divider />
        <Body size="label" muted>
          {t('appNameFull')} · {t('version')} 1.0.0
        </Body>
        <Body size="caption" muted style={{ marginTop: space.sm }}>
          {t('tagline')}
        </Body>
      </Card>

      <Card>
        <Body size="caption" muted>
          {t('demoNotice')}
        </Body>
      </Card>
      <View style={{ height: space.xl }} />
    </Screen>
  );
}

