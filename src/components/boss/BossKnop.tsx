import type { ReactNode } from 'react';
import { Pressable, View } from 'react-native';
import { useHulp } from '@/providers/HulpProvider';
import { BossAvatar } from '../BossChat';

/**
 * Boss openen vanaf het klant- of projectscherm, met die klant of dat project
 * als "deze klant" (Boss legt vast: "noteer dat ze een hond hebben"). Staat in
 * de kop, naast de bestaande knop (`naast`).
 */
export function BossKnop({
  klantId,
  projectId,
  naast,
}: {
  klantId?: string | null;
  projectId?: string | null;
  naast?: ReactNode;
}) {
  const { openBoss } = useHulp();
  const wat = projectId ? 'dit project' : 'deze klant';
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
      <Pressable
        onPress={() => openBoss(projectId ? { project_id: projectId } : klantId ? { klant_id: klantId } : null)}
        accessibilityRole="button"
        accessibilityLabel={`Boss: iets vastleggen voor ${wat}`}
        testID="boss-ingang"
        hitSlop={6}
        style={({ pressed }) => [pressed && { opacity: 0.7 }]}
      >
        <BossAvatar size={32} />
      </Pressable>
      {naast}
    </View>
  );
}
