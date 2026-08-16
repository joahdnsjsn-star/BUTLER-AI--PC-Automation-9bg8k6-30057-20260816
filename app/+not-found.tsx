import { Link, Stack } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';
import { theme } from '@/constants/theme';

export default function NotFoundScreen() {
  return (
    <>
      <Stack.Screen options={{ title: 'Not found' }} />
      <View style={styles.container}>
        <Text style={styles.title}>This screen doesn’t exist.</Text>
        <Link href="/" style={styles.link}>
          <Text style={styles.linkText}>Go to chat</Text>
        </Link>
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 20, backgroundColor: theme.bg },
  title: { color: theme.text, fontSize: 18, fontWeight: '600' },
  link: { marginTop: 16 },
  linkText: { color: theme.primary, fontSize: 15, fontWeight: '600' },
});
