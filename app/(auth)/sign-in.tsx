import { supabase } from '@/lib/supabase';
import { Link } from 'expo-router';
import React, { useState } from 'react';
import { Alert, Text, TextInput, TouchableOpacity, View } from 'react-native';


export default function SignIn() {
  const [email, setEmail] = useState(''), [password, setPassword] = useState(''), [busy, setBusy] = useState(false);


  const signIn = async () => {
    if (!email || !password) return Alert.alert('Missing', 'Email and password required');
    try {
      setBusy(true);
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error; // Gate will redirect after session arrives
    } catch (e: any) {
      Alert.alert('Sign in failed', e.message ?? 'Try again');
    } finally { setBusy(false); }
  };


  return (
    <View style={{ flex: 1, padding: 20, justifyContent: 'center', gap: 12 }}>
      <Text style={{ fontSize: 24, fontWeight: '700' }}>Sign in</Text>
      <TextInput value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none"
        placeholder="Email" style={{ borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 10, padding: 12 }} />
      <TextInput value={password} onChangeText={setPassword} placeholder="Password" secureTextEntry
        style={{ borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 10, padding: 12 }} />
      <TouchableOpacity onPress={signIn} disabled={busy}
        style={{ backgroundColor: busy ? '#9ca3af' : '#2563eb', padding: 14, borderRadius: 10, alignItems: 'center' }}>
        <Text style={{ color: 'white', fontWeight: '700' }}>{busy ? 'Signing in…' : 'Sign in'}</Text>
      </TouchableOpacity>
      <Text style={{ textAlign: 'center' }}>
        No account? <Link href="/(auth)/sign-up" style={{ color: '#2563eb', fontWeight: '700' }}>Sign up</Link>
      </Text>
    </View>
  );
}
