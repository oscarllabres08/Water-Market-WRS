import type { ComponentProps, PropsWithChildren } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView } from 'react-native';

type Props = PropsWithChildren<ComponentProps<typeof ScrollView>> & {
  offset?: number;
};

/** Keeps focused inputs visible while the software keyboard is open. */
export function KeyboardAwareScrollView({ children, offset = 8, contentContainerStyle, ...rest }: Props) {
  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={Platform.OS === 'ios' ? offset : 0}
    >
      <ScrollView
        scrollEnabled
        nestedScrollEnabled
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        automaticallyAdjustKeyboardInsets
        contentInsetAdjustmentBehavior="automatic"
        {...rest}
        contentContainerStyle={[{ paddingBottom: 32 }, contentContainerStyle]}
      >
        {children}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}