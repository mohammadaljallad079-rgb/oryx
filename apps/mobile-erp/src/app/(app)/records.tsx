import React from 'react';
import { Text, View } from 'react-native';
import { router } from 'expo-router';

import { useApp } from '../../lib/app-context';
import { visibleResources } from '../../lib/resources';
import { Card, Heading, Screen, StateView } from '../../components/ui';
import { space, typography } from '../../lib/theme';

/**
 * The records hub.
 *
 * Shows one card per resource the signed-in user may read, derived from the
 * permission catalog rather than a hard-coded menu. A company administrator
 * therefore sees exactly the modules its plan licenses and its role grants, and
 * the API enforces the same rule on every call.
 */
export default function RecordsScreen() {
  const { permissions, theme, t } = useApp();
  const resources = visibleResources(permissions);

  if (resources.length === 0) {
    return (
      <Screen>
        <StateView kind="empty" message={t('noPermission')} />
      </Screen>
    );
  }

  return (
    <Screen>
      <Heading>{t('browse')}</Heading>
      <Text style={{ color: theme.textMuted, fontSize: typography.label, marginBottom: space.md }}>
        {resources.length} {t('results')}
      </Text>
      <View style={{ gap: space.md }}>
        {resources.map((resource) => (
          <Card key={resource.key} onPress={() => router.push(`/(app)/browse/${resource.key}`)}>
            <Text style={{ color: theme.text, fontSize: typography.body, fontWeight: '700' }}>
              {t(resource.title)}
            </Text>
            <Text style={{ color: theme.textFaint, fontSize: typography.caption, marginTop: 2 }}>
              {resource.path}
            </Text>
          </Card>
        ))}
      </View>
    </Screen>
  );
}
