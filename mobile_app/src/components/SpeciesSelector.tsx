import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { colors, radii, spacing } from '../theme';
import { SpeciesId, SpeciesProfile } from '../types/models';

interface SpeciesSelectorProps {
  profiles: SpeciesProfile[];
  selectedId: SpeciesId;
  onSelect: (id: SpeciesId) => void;
}

export function SpeciesSelector({
  profiles,
  selectedId,
  onSelect,
}: SpeciesSelectorProps) {
  return (
    <ScrollView
      contentContainerStyle={styles.content}
      horizontal
      showsHorizontalScrollIndicator={false}
    >
      {profiles.map(profile => {
        const selected = profile.id === selectedId;
        return (
          <Pressable
            key={profile.id}
            onPress={() => onSelect(profile.id)}
            style={[styles.item, selected && styles.selected]}
          >
            <View style={[styles.emojiBox, selected && styles.emojiSelected]}>
              <Text style={styles.emoji}>{profile.emoji}</Text>
            </View>
            <Text style={[styles.name, selected && styles.nameSelected]}>
              {profile.displayName}
            </Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { gap: spacing.sm, paddingRight: spacing.lg },
  item: {
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radii.md,
    borderWidth: 1,
    minWidth: 88,
    padding: spacing.md,
  },
  selected: { backgroundColor: colors.primary, borderColor: colors.primary },
  emojiBox: {
    alignItems: 'center',
    backgroundColor: colors.background,
    borderRadius: 22,
    height: 44,
    justifyContent: 'center',
    width: 44,
  },
  emojiSelected: { backgroundColor: 'rgba(255,255,255,0.18)' },
  emoji: { fontSize: 24 },
  name: {
    color: colors.text,
    fontSize: 12,
    fontWeight: '700',
    marginTop: spacing.sm,
  },
  nameSelected: { color: '#FFF' },
});
