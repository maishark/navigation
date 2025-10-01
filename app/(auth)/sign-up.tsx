import { supabase } from '@/lib/supabase';
import { Link } from 'expo-router';
import React, { useState } from 'react';
import { Alert, Text, TextInput, TouchableOpacity, View } from 'react-native';

const isStrongPassword = (pwd: string) =>
  /^(?=.*\d)(?=.*[^A-Za-z0-9]).{6,}$/.test(pwd);

export default function SignUp() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);

  const signUp = async () => {
    if (!email || !password || !confirm) {
      return Alert.alert('Missing', 'Email, password and confirm password are required.');
    }
    if (password !== confirm) {
      return Alert.alert('Mismatch', 'Passwords do not match.');
    }
    if (!isStrongPassword(password)) {
      return Alert.alert(
        'Weak password',
        'Use at least 6 characters, including at least one digit and one special character.'
      );
    }
    try {
      setBusy(true);
      const { error } = await supabase.auth.signUp({ email, password });
      if (error) throw error; // with email confirmations OFF, session is created
      Alert.alert('Success', 'Account created! Check your email for verification (if enabled).');
    } catch (e: any) {
      Alert.alert('Sign up failed', e.message ?? 'Try again');
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={{ flex: 1, padding: 20, justifyContent: 'center', gap: 12 }}>
      <Text style={{ fontSize: 24, fontWeight: '700' }}>Create account</Text>

      <TextInput
        value={email}
        onChangeText={setEmail}
        keyboardType="email-address"
        autoCapitalize="none"
        placeholder="Email"
        style={{ borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 10, padding: 12 }}
      />

      <TextInput
        value={password}
        onChangeText={setPassword}
        placeholder="Password"
        secureTextEntry
        style={{ borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 10, padding: 12 }}
      />

      <TextInput
        value={confirm}
        onChangeText={setConfirm}
        placeholder="Confirm Password"
        secureTextEntry
        style={{ borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 10, padding: 12 }}
      />

      <TouchableOpacity
        onPress={signUp}
        disabled={busy}
        style={{
          backgroundColor: busy ? '#9ca3af' : '#2563eb',
          padding: 14,
          borderRadius: 10,
          alignItems: 'center',
        }}
      >
        <Text style={{ color: 'white', fontWeight: '700' }}>
          {busy ? 'Creating…' : 'Sign up'}
        </Text>
      </TouchableOpacity>

      <Text style={{ textAlign: 'center' }}>
        Have an account?{' '}
        <Link href="/(auth)/sign-in" style={{ color: '#2563eb', fontWeight: '700' }}>
          Sign in
        </Link>
      </Text>
    </View>
  );
}
