/**
 * Reusable lightweight legal/document screen.
 * Renders plain text in a scrollable monospace block with a back button.
 */
import { useRouter } from 'expo-router';
import { Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { theme } from '@/constants/theme';

const MONO: any = Platform.OS === 'ios' ? 'Courier' : 'monospace';

export function LegalDocView({ title, body }: { title: string; body: string }) {
  const router = useRouter();
  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={12} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={22} color={theme.text} />
        </Pressable>
        <Text style={styles.title}>{title}</Text>
        <View style={{ width: 32 }} />
      </View>
      <ScrollView contentContainerStyle={styles.scroll}>
        <Text style={styles.body}>{body}</Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: theme.bg },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: theme.border,
  },
  backBtn: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center' },
  title: { color: theme.text, fontSize: 16, fontWeight: '700' },
  scroll: { padding: 16, paddingBottom: 48 },
  body: { color: theme.text, fontSize: 13, lineHeight: 19, fontFamily: MONO },
});
