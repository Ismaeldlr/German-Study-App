import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type Dispatch,
  type ReactNode,
  type SetStateAction,
} from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useKeyboardState } from 'react-native-keyboard-controller';

import { AppText } from './AppText';
import { TextField, type TextFieldProps } from './TextField';
import { radius, spacing, useTheme } from './theme';

/**
 * An umlaut bar for every typing screen. A focused GermanField registers
 * itself; the bar, placed at the bottom of the screen above the keyboard,
 * inserts the letter at the cursor.
 */

interface InsertTarget {
  insert(text: string): void;
}

interface UmlautContextValue {
  active: InsertTarget | null;
  setActive: Dispatch<SetStateAction<InsertTarget | null>>;
}

const UmlautContext = createContext<UmlautContextValue | null>(null);

export function UmlautProvider({ children }: { children: ReactNode }) {
  const [active, setActive] = useState<InsertTarget | null>(null);
  const value = useMemo(() => ({ active, setActive }), [active]);
  return <UmlautContext.Provider value={value}>{children}</UmlautContext.Provider>;
}

export const UMLAUTS = ['ä', 'ö', 'ü', 'ß', 'Ä', 'Ö', 'Ü'] as const;

export function UmlautBar({ testID = 'umlaut-bar' }: { testID?: string }) {
  const context = useContext(UmlautContext);
  const theme = useTheme();
  // Back can hide the keyboard while the field keeps focus; the bar goes with it.
  const keyboardVisible = useKeyboardState((state) => state.isVisible);
  if (!context?.active || !keyboardVisible) return null;
  const target = context.active;
  return (
    <View
      testID={testID}
      style={[styles.bar, { backgroundColor: theme.surfaceAlt, borderTopColor: theme.border }]}
    >
      {UMLAUTS.map((letter) => (
        <Pressable
          key={letter}
          testID={`umlaut-${letter}`}
          accessibilityRole="button"
          accessibilityLabel={`Insert ${letter}`}
          onPress={() => target.insert(letter)}
          style={({ pressed }) => [
            styles.key,
            {
              backgroundColor: pressed ? theme.primarySoft : theme.surface,
              borderColor: theme.border,
              borderBottomWidth: pressed ? 1 : 3,
              transform: [{ translateY: pressed ? 2 : 0 }],
            },
          ]}
        >
          <AppText variant="heading" style={{ color: theme.primary }}>
            {letter}
          </AppText>
        </Pressable>
      ))}
    </View>
  );
}

/** Insert text into a value at a selection. Exported for tests. */
export function insertAt(
  value: string,
  selection: { start: number; end: number },
  text: string,
): { value: string; cursor: number } {
  const start = Math.max(0, Math.min(selection.start, value.length));
  const end = Math.max(start, Math.min(selection.end, value.length));
  return { value: value.slice(0, start) + text + value.slice(end), cursor: start + text.length };
}

export type GermanFieldProps = Omit<TextFieldProps, 'value' | 'onChangeText'> & {
  value: string;
  onChangeText: (text: string) => void;
};

/** A TextField the umlaut bar can type into. */
export function GermanField({ value, onChangeText, onFocus, onBlur, ...rest }: GermanFieldProps) {
  const context = useContext(UmlautContext);
  const selection = useRef({ start: value.length, end: value.length });
  const latest = useRef({ value, onChangeText });
  useEffect(() => {
    latest.current = { value, onChangeText };
  });

  const [target] = useState<InsertTarget>(() => ({
    insert(text) {
      const next = insertAt(latest.current.value, selection.current, text);
      selection.current = { start: next.cursor, end: next.cursor };
      latest.current.onChangeText(next.value);
    },
  }));

  const setActive = context?.setActive;
  useEffect(
    () => () => setActive?.((current) => (current === target ? null : current)),
    [setActive, target],
  );

  return (
    <TextField
      {...rest}
      value={value}
      onChangeText={(text) => {
        selection.current = { start: text.length, end: text.length };
        onChangeText(text);
      }}
      onSelectionChange={(event) => {
        selection.current = event.nativeEvent.selection;
      }}
      onFocus={(event) => {
        setActive?.(target);
        onFocus?.(event);
      }}
      onBlur={(event) => {
        setActive?.((current) => (current === target ? null : current));
        onBlur?.(event);
      }}
    />
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    gap: spacing.xs,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  key: {
    flex: 1,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.sm,
    borderWidth: 1,
  },
});
