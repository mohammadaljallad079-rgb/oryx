import React, { useCallback, useEffect, useState } from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';

import { useApp } from '../../lib/app-context';
import { useLiveSession } from '../../lib/live-session';
import {
  ApiError,
  inspectionPhotosApi,
  mediaUrl,
  sensageAiApi,
  type InspectionPhoto,
} from '../../lib/api';
import { useAsync } from '../../lib/use-async';
import { ScreenHeader } from '../../components/brand';
import {
  Badge,
  Body,
  Button,
  Card,
  Heading,
  Screen,
  SectionLabel,
  StateView,
} from '../../components/ui';
import { radius, space, typography } from '../../lib/theme';
import { formatDateTime, localizeDigits } from '../../lib/format';
import type { AiSuggestionDto } from '@oryx/shared';

/**
 * SENSAGE analysis (P7).
 *
 * The real, server-side analysis path — distinct from the demo report on the
 * inspection screen. Three honest states are shown:
 *
 *   - **Unconfigured** — no AI provider holds credentials, so no analysis is
 *     offered at all. The screen says so rather than faking a result.
 *   - **Pending** — a stored suggestion that no human has reviewed. It is
 *     labelled a suggestion, never a diagnosis.
 *   - **Verified** — a reviewer approved it, and only then is it shown as
 *     reviewed.
 *
 * The photographs come from the customer's own SENSAGE upload history, so the
 * model is asked about a file that actually exists on the server.
 */
export default function SensageAi() {
  const { t, theme } = useApp();
  const { isLive } = useLiveSession();

  const [photoId, setPhotoId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [suggestion, setSuggestion] = useState<AiSuggestionDto | null>(null);

  const status = useAsync(async () => (isLive ? sensageAiApi.status() : null), [isLive]);
  const photos = useAsync(async () => (isLive ? inspectionPhotosApi.list() : []), [isLive]);
  const history = useAsync(async () => (isLive ? sensageAiApi.suggestions() : []), [isLive]);

  useEffect(() => {
    if (!photoId && (photos.data ?? []).length > 0) setPhotoId(photos.data![0]!.id);
  }, [photoId, photos.data]);

  const analyze = useCallback(async () => {
    if (!photoId || busy) return;
    setBusy(true);
    setNotice(null);
    setSuggestion(null);
    try {
      const created = await sensageAiApi.analyze({ photoId });
      setSuggestion(created);
      await history.reload();
    } catch (err) {
      setNotice(
        err instanceof ApiError && err.kind === 'offline' ? t('offlineBody') : t('sensageAiFailed'),
      );
    } finally {
      setBusy(false);
    }
  }, [busy, history, photoId, t]);

  if (!isLive) {
    return (
      <Screen>
        <ScreenHeader title={t('sensageAiTitle')} />
        <Card>
          <Body muted size="label">{t('guestBrowsing')}</Body>
        </Card>
      </Screen>
    );
  }

  const configured = status.data?.configured ?? false;

  return (
    <Screen>
      <ScreenHeader title={t('sensageAiTitle')} subtitle={t('sensageAiPending')} />

      <Card testID="sensage-ai-status">
        {status.loading ? (
          <StateView kind="loading" />
        ) : configured ? (
          <Badge text={status.data?.providerKey ?? 'AI'} tone="success" />
        ) : (
          <View style={{ gap: space.xs }}>
            <Badge text="AWAITING_CREDENTIALS" tone="neutral" />
            <Body size="caption" muted>
              {t('sensageAiUnconfigured')}
            </Body>
          </View>
        )}
      </Card>

      {/* The request is offered only when a provider is actually configured. A
          button that always failed would misrepresent the deployment. */}
      {configured ? (
        <Card>
          <SectionLabel>{t('photoPreview')}</SectionLabel>
          {(photos.data ?? []).length === 0 ? (
            <Body size="caption" muted style={{ marginTop: space.sm }}>
              {t('noResults')}
            </Body>
          ) : (
            <View style={styles.row}>
              {(photos.data ?? []).slice(0, 8).map((photo) => (
                <PhotoChoice
                  key={photo.id}
                  photo={photo}
                  selected={photoId === photo.id}
                  onPress={() => setPhotoId(photo.id)}
                />
              ))}
            </View>
          )}

          <Button
            testID="sensage-ai-run"
            title={t('sensageAiRun')}
            loading={busy}
            disabled={busy || !photoId}
            onPress={() => void analyze()}
          />
          {notice ? (
            <Body size="caption" style={{ color: theme.danger, marginTop: space.sm }}>
              {notice}
            </Body>
          ) : null}
        </Card>
      ) : null}

      {suggestion ? <SuggestionCard suggestion={suggestion} /> : null}

      <SectionLabel>{t('uploadHistory')}</SectionLabel>
      {history.loading ? (
        <StateView kind="loading" />
      ) : (history.data ?? []).length === 0 ? (
        <StateView kind="empty" message={t('sensageAiNone')} />
      ) : (
        (history.data ?? []).map((row) => (
          <Pressable key={row.id} onPress={() => setSuggestion(row)} testID={`sensage-ai-history-${row.id}`}>
            <Card>
              <View style={styles.head}>
                <Text style={{ color: theme.text, fontSize: typography.label, fontWeight: '600', flex: 1 }} numberOfLines={2}>
                  {row.summary}
                </Text>
                <Badge
                  text={row.verified ? t('sensageAiVerified') : row.reviewStatus}
                  tone={row.verified ? 'success' : 'neutral'}
                />
              </View>
              <Body size="caption" muted style={{ marginTop: space.xs }}>
                {formatDateTime(row.createdAt)}
              </Body>
            </Card>
          </Pressable>
        ))
      )}
      <View style={{ height: space.xl }} />
    </Screen>
  );
}

function PhotoChoice({
  photo,
  selected,
  onPress,
}: {
  photo: InspectionPhoto;
  selected: boolean;
  onPress: () => void;
}) {
  const { theme } = useApp();
  const uri = mediaUrl(photo.url);
  return (
    <Pressable
      testID={`sensage-ai-photo-${photo.id}`}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={[styles.photo, { borderColor: selected ? theme.gold : theme.border }]}
    >
      {uri ? <Image source={{ uri }} style={styles.photoImage} resizeMode="cover" /> : null}
    </Pressable>
  );
}

function SuggestionCard({ suggestion }: { suggestion: AiSuggestionDto }) {
  const { t, theme, locale } = useApp();
  return (
    <Card testID="sensage-ai-suggestion">
      <View style={styles.head}>
        <Heading size="subheading">{t('sensageAiSummary')}</Heading>
        {/* The label is the whole point: an unreviewed model output is a
            suggestion, not a diagnosis, and it says so on the card. */}
        <Badge
          text={suggestion.verified ? t('sensageAiVerified') : suggestion.reviewStatus}
          tone={suggestion.verified ? 'success' : 'neutral'}
        />
      </View>
      <Body size="label" style={{ marginTop: space.sm }}>
        {suggestion.summary}
      </Body>
      {suggestion.confidence !== null ? (
        <Body size="caption" muted style={{ marginTop: space.xs }}>
          {`${t('sensageAiConfidence')}: ${localizeDigits(Math.round(suggestion.confidence * 100), locale)}%`}
        </Body>
      ) : null}
      <Body size="caption" muted style={{ marginTop: space.sm }}>
        {suggestion.verified ? t('sensageAiVerified') : t('sensageAiPending')}
      </Body>
      {suggestion.reviewNote ? (
        <Body size="caption" muted style={{ marginTop: space.xs }}>
          {suggestion.reviewNote}
        </Body>
      ) : null}
      <Body size="caption" muted style={{ marginTop: space.sm }}>
        {formatDateTime(suggestion.createdAt)}
      </Body>
      <Text style={{ color: theme.textFaint, fontSize: typography.caption, marginTop: space.sm }}>
        {suggestion.providerKey}
      </Text>
    </Card>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm, marginTop: space.sm, marginBottom: space.md },
  photo: { width: 64, height: 64, borderRadius: radius.md, borderWidth: 2, overflow: 'hidden' },
  photoImage: { width: '100%', height: '100%' },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space.sm },
});
