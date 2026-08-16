/**
 * index.tsx — Legacy redirect stub.
 * Uses router.replace inside useEffect so the navigator is fully
 * initialized before navigation fires. This avoids the WeakMap crash
 * on web where <Redirect> renders before ContextNavigator is ready.
 */
import { useEffect } from 'react';
import { View } from 'react-native';
import { useRouter } from 'expo-router';

export default function IndexRedirect() {
  const router = useRouter();
  useEffect(() => {
    router.replace('/(tabs)/nexushome' as any);
  }, []);
  return <View style={{ flex: 1, backgroundColor: '#050810' }} />;
}
