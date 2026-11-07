/**
 * CalculatorApp — ek hi file mein pura calculator.
 * Stack: React Native + Expo, sirf Expo built-ins:
 *   expo-haptics, @react-native-async-storage/async-storage
 * Animations: RN Animated + PanResponder. eval()/new Function() — kabhi nahi.
 * Engine: token expression + recursive-descent parser (² postfix, ( ) brackets).
 */
import React, {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from 'react';
import {
  Animated,
  LayoutAnimation,
  Modal,
  PanResponder,
  Platform,
  Pressable,
  SectionList,
  StatusBar,
  StyleSheet,
  Switch,
  Text,
  UIManager,
  View,
  useAnimatedValue,
  useColorScheme,
} from 'react-native';
import type { PanResponderInstance, StyleProp, ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Haptics from 'expo-haptics';

/* Android par LayoutAnimation delete/collapse animate karta hai */
if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

/* --- impure helpers (module level, render se door) --- */
let historyIdSeq = 0;
function nextCalcId(): string {
  historyIdSeq += 1;
  void historyIdSeq;
  return `calc-${historyIdSeq}-${Date.now()}`;
}
/** render/compiler purity ko satisfy karne ke liye wrapper */
function nowMs(): number {
  void 0;
  return Date.now();
}

/* ------------------------------------------------------------------ */
/* Types & constants                                                   */
/* ------------------------------------------------------------------ */

type Op = '+' | '-' | '×' | '÷';
type Token = string; // number ('45', '-5') | '+' '-' '×' '÷' '(' ')' '²'
type ThemeMode = 'light' | 'dark' | 'system';

interface HistoryEntry {
  id: string;
  expression: string;
  result: string;
  ts: number;
}

interface Settings {
  theme: ThemeMode;
  haptics: boolean;
  decimals: number; // 0..10
}

const SETTINGS_KEY = 'calc-settings';
const HISTORY_KEY = 'calc-history';
const MAX_HISTORY = 100;
const MAX_DIGITS = 12;

const DEFAULT_SETTINGS: Settings = {
  theme: 'system',
  haptics: true,
  decimals: 2,
};

const OPS: readonly string[] = ['+', '-', '×', '÷'];
const SQUARE = '²';

const isOp = (t: Token): t is Op => OPS.includes(t);
const isNumToken = (t: Token): boolean =>
  t !== '(' && t !== ')' && t !== SQUARE && !isOp(t);
const countOpen = (list: Token[]): number =>
  list.reduce((n, t) => (t === '(' ? n + 1 : t === ')' ? n - 1 : n), 0);
const endsLikeValue = (list: Token[]): boolean => {
  const last = list[list.length - 1];
  return last !== undefined && (isNumToken(last) || last === ')' || last === SQUARE);
};

/* ------------------------------------------------------------------ */
/* Theme palette — saare colors yahin, hardcode nahi                   */
/* ------------------------------------------------------------------ */

interface Palette {
  bg: string;
  card: string;
  cardBorder: string;
  expression: string;
  displayText: string;
  secondary: string;
  toolbarBtn: string;
  toolbarText: string;
  numberBg: string;
  numberText: string;
  functionBg: string;
  functionText: string;
  operatorBg: string;
  operatorText: string;
  operatorActiveBg: string;
  operatorActiveText: string;
  equalsBg: string;
  equalsText: string;
  pillBg: string;
  pillText: string;
  overlay: string;
  sheet: string;
  sheetText: string;
  sheetEntry: string;
  sheetEntryBorder: string;
  entryMeta: string;
  clearBg: string;
  clearText: string;
  dimmed: string;
  switchOn: string;
  toast: string;
  toastText: string;
  divider: string;
}

const LIGHT: Palette = {
  bg: '#F4F5F8',
  card: '#FFFFFF',
  cardBorder: 'rgba(15, 23, 42, 0.06)',
  expression: '#94A3B8',
  displayText: '#0F172A',
  secondary: '#94675F',
  toolbarBtn: '#ECEEF3',
  toolbarText: '#0F172A',
  numberBg: '#ECEEF3',
  numberText: '#151B2B',
  functionBg: '#DDE1E9',
  functionText: '#151B2B',
  operatorBg: '#1D4ED8',
  operatorText: '#FFFFFF',
  operatorActiveBg: '#FFFFFF',
  operatorActiveText: '#1D4ED8',
  equalsBg: '#10B981',
  equalsText: '#FFFFFF',
  pillBg: '#ECEEF3',
  pillText: '#475569',
  overlay: 'rgba(15, 23, 42, 0.45)',
  sheet: '#FFFFFF',
  sheetText: '#0F172A',
  sheetEntry: '#F4F5F8',
  sheetEntryBorder: '#E2E8F0',
  entryMeta: '#94A3B8',
  clearBg: '#FEE2E2',
  clearText: '#DC2626',
  dimmed: '#CBD5E1',
  switchOn: '#10B981',
  toast: '#0F172A',
  toastText: '#FFFFFF',
  divider: '#E2E8F0',
};

const DARK: Palette = {
  bg: '#0F172A',
  card: '#1E293B',
  cardBorder: 'rgba(255, 255, 255, 0.06)',
  expression: '#64748B',
  displayText: '#F1F5F9',
  secondary: '#F0A9A0',
  toolbarBtn: '#334155',
  toolbarText: '#F1F5F9',
  numberBg: '#334155',
  numberText: '#F1F5F9',
  functionBg: '#475569',
  functionText: '#F1F5F9',
  operatorBg: '#1D4ED8',
  operatorText: '#FFFFFF',
  operatorActiveBg: '#FFFFFF',
  operatorActiveText: '#1D4ED8',
  equalsBg: '#10B981',
  equalsText: '#FFFFFF',
  pillBg: '#334155',
  pillText: '#CBD5E1',
  overlay: 'rgba(2, 6, 23, 0.6)',
  sheet: '#1E293B',
  sheetText: '#F1F5F9',
  sheetEntry: '#0F172A',
  sheetEntryBorder: '#334155',
  entryMeta: '#64748B',
  clearBg: 'rgba(220, 38, 38, 0.2)',
  clearText: '#FCA5A5',
  dimmed: '#334155',
  switchOn: '#10B981',
  toast: '#F1F5F9',
  toastText: '#0F172A',
  divider: '#334155',
};

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

/** Float noise fix: 0.1 + 0.2 -> 0.3 */
function cleanFloat(n: number): number {
  return parseFloat(n.toPrecision(12));
}

function numToString(n: number): string {
  if (!isFinite(n)) return 'Error';
  return String(cleanFloat(n));
}

/** Integer part par hazaar ke commas: 1234567 -> 1,234,567 */
function commify(value: string): string {
  if (value === 'Error') return value;
  const neg = value.startsWith('-');
  const raw = neg ? value.slice(1) : value;
  const dot = raw.indexOf('.');
  const intPart = dot === -1 ? raw : raw.slice(0, dot);
  const fracPart = dot === -1 ? '' : raw.slice(dot);
  const withCommas = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return (neg ? '-' : '') + withCommas + fracPart;
}

function roundForDisplay(n: number, decimals: number): number {
  const clean = cleanFloat(n);
  if (decimals <= 0) return Math.round(clean);
  return Number(clean.toFixed(decimals));
}

/** Number token ko display string mein: negative number bracket mein (-5) */
function renderNumber(t: string): string {
  if (t.startsWith('-')) return `(-${commify(t.slice(1))})`;
  return commify(t);
}

function renderToken(t: Token): string {
  if (isOp(t) || t === '(' || t === ')' || t === SQUARE) return t;
  return renderNumber(t);
}

/** Bada display / history expression — bina spaces, commified */
function renderTokens(list: Token[]): string {
  return list.map(renderToken).join('');
}

/* ------------------------------------------------------------------ */
/* Recursive-descent parser — eval() nahi                              */
/* expr → term (+|- term)*, term → factor ((×|÷) factor)*,             */
/* factor → unary ²*, unary → - unary | primary, primary → num | (expr) */
/* Failures par NaN; ÷0 Infinity/NaN dono !isFinite => Error.          */
/* ------------------------------------------------------------------ */

function evalTokenList(list: Token[]): number {
  let pos = 0;

  const parseExpr = (): number => {
    let v = parseTerm();
    while (pos < list.length && (list[pos] === '+' || list[pos] === '-')) {
      const op = list[pos];
      pos += 1;
      const r = parseTerm();
      v = op === '+' ? v + r : v - r;
    }
    return v;
  };

  const parseTerm = (): number => {
    let v = parseFactor();
    while (pos < list.length && (list[pos] === '×' || list[pos] === '÷')) {
      const op = list[pos];
      pos += 1;
      const r = parseFactor();
      if (op === '÷' && r === 0) return Number.NaN; // divide by zero
      v = op === '×' ? v * r : v / r;
    }
    return v;
  };

  const parseFactor = (): number => {
    let v = parseUnary();
    while (pos < list.length && list[pos] === SQUARE) {
      pos += 1;
      v = v * v;
    }
    return v;
  };

  const parseUnary = (): number => {
    if (list[pos] === '-') {
      pos += 1;
      return -parseUnary();
    }
    if (list[pos] === '+') {
      pos += 1;
      return parseUnary();
    }
    return parsePrimary();
  };

  const parsePrimary = (): number => {
    const t = list[pos];
    if (typeof t === 'string' && isNumToken(t)) {
      pos += 1;
      return parseFloat(t);
    }
    if (t === '(') {
      pos += 1;
      const v = parseExpr();
      if (list[pos] !== ')') return Number.NaN; // unbalanced
      pos += 1;
      return v;
    }
    return Number.NaN; // unexpected
  };

  const v = parseExpr();
  if (pos < list.length && list[pos] !== ')') return Number.NaN; // trailing junk
  // khule bracket list mein aane par yahan ')' hota — caller autoclose karta hai
  if (Number.isNaN(v) || !isFinite(v)) return Number.NaN;
  return v;
}

/**
 * Evaluate-list prep: trailing operators/(' strip (preview ke liye optional),
 * khule brackets auto-close.
 */
function buildEvalList(parts: Token[], current: string, stripTrailing: boolean): Token[] {
  const list: Token[] = [...parts];
  if (current !== '') list.push(current);
  if (stripTrailing) {
    // trailing operators hatao; lekin '²' (valid postfix) aur ')' rakhna hai
    while (list.length > 0) {
      const last = list[list.length - 1];
      if (last === SQUARE) break;
      if (isNumToken(last)) break;
      if (last === ')') break;
      list.pop();
    }
  }
  const opens = countOpen(list);
  for (let i = 0; i < opens; i += 1) list.push(')');
  return list;
}

/** Live result (chhota neechla text) */
function liveResultOf(
  parts: Token[],
  current: string,
  decimals: number,
): { present: boolean; value: string } {
  const hasSomething = listHasActivity(parts);
  if (!hasSomething) return { present: false, value: '' };
  const list = buildEvalList(parts, current, true);
  // sikka: bracket-ke-baand ke bina residual '(' paren-close — autoclose upar ho chuka
  if (list.length === 0) return { present: false, value: '' };
  const raw = evalTokenList(list);
  if (Number.isNaN(raw) || !isFinite(raw)) return { present: true, value: 'Error' };
  return { present: true, value: numToString(roundForDisplay(raw, decimals)) };
}

/** Operator ya ² ya bracket present hai? (live result dikhane ka shart) */
function listHasActivity(parts: Token[]): boolean {
  return parts.some((t) => !isNumToken(t));
}

/** SectionList group: Today / Yesterday / date */
function groupLabel(ts: number): string {
  const d = new Date(ts);
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const dayMs = 86400000;
  if (ts >= startOfToday) return 'Today';
  if (ts >= startOfToday - dayMs) return 'Yesterday';
  return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}

function timeLabel(ts: number): string {
  return new Date(ts).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}

/* ------------------------------------------------------------------ */
/* Calculator engine — tokens + current, brackets + square             */
/* ------------------------------------------------------------------ */

interface EngineState {
  parts: Token[]; // committed tokens (number/'('/')'/op/'²')
  current: string; // input ho raha number ('' agar abhi nahi)
  resultDisplay: string | null; // = ke baad ka bada text
  justEvaluated: boolean;
  committedExpr: string; // evaluate hua expression (history ke liye)
  calcTick: number;
  calcTs: number;
}

const initialEngine: EngineState = {
  parts: [],
  current: '',
  resultDisplay: null,
  justEvaluated: false,
  committedExpr: '',
  calcTick: 0,
  calcTs: 0,
};

function engineError(prev: EngineState): EngineState {
  return {
    parts: [],
    current: '',
    resultDisplay: 'Error',
    justEvaluated: true,
    committedExpr: '', // history mein save NAHI
    calcTick: prev.calcTick,
    calcTs: prev.calcTs,
  };
}

function useCalculatorEngine(decimals: number) {
  const [state, setState] = useState<EngineState>(initialEngine);

  const clear = useCallback(() => setState(initialEngine), []);

  const freshStart = (over: Partial<EngineState>, prev: EngineState): EngineState => ({
    parts: [],
    current: '',
    resultDisplay: null,
    justEvaluated: false,
    committedExpr: '',
    calcTick: prev.calcTick,
    calcTs: prev.calcTs,
    ...over,
  });

  /** Number typed/dot/^2 ke baad ')' ya '²' ke sath implicit × ke rules */
  const digitBase = (p: EngineState, start: string): EngineState => {
    if (isOp(p.parts[p.parts.length - 1]) || p.parts[p.parts.length - 1] === '(') {
      return { ...p, current: start, resultDisplay: null };
    }
    // ')' ya '²' ya number ke baad number — implicit ×
    const parts = [...p.parts];
    if (parts.length > 0 && endsLikeValue(parts)) parts.push('×');
    return { ...p, parts, current: start, resultDisplay: null };
  };

  const inputDigit = useCallback((d: string) => {
    setState((p) => {
      if (p.justEvaluated && p.resultDisplay) {
        return freshStart({ current: d }, p); // naya calc shuru
      }
      if (p.current === '') {
        return digitBase(p, d);
      }
      const digits = p.current.replace(/[-.]/g, '');
      if (digits.length >= MAX_DIGITS) return p;
      const next = p.current === '0' && d !== '.' ? d : p.current + d;
      return { ...p, current: next, resultDisplay: null };
    });
  }, []);

  const inputDot = useCallback(() => {
    setState((p) => {
      if (p.justEvaluated && p.resultDisplay) {
        return freshStart({ current: '0.' }, p);
      }
      if (p.current === '') return digitBase(p, '0.');
      return p.current.includes('.') ? p : { ...p, current: p.current + '.', resultDisplay: null };
    });
  }, []);

  /** "(" — khali/op/"(" ke baad seedha; number/')'/'²' ke baad implicit ×;
   *  "=" ke baad naya calc (result × ( nahi). */
  const openParen = useCallback(() => {
    setState((p) => {
      if (p.justEvaluated && p.resultDisplay) return freshStart({ parts: ['('] }, p);
      const parts = [...p.parts];
      if (p.current !== '') {
        parts.push(p.current, '×');
      } else if (parts.length > 0 && endsLikeValue(parts)) {
        parts.push('×');
      } else if (isOp(parts[parts.length - 1])) {
        // operator ke baad seedha (implicit minus ke bajaye seedha '(')
      } else if (parts[parts.length - 1] === '(') {
        // nested — seedha
      }
      parts.push('(');
      return { ...p, parts, current: '', resultDisplay: null };
    });
  }, []);

  /** ")" — khula bracket zaroori; khali "( )" Cancel, op ke baad op drop kar ke band */
  const closeParen = useCallback(() => {
    setState((p) => {
      if (p.justEvaluated) return p;
      let list: Token[] = [...p.parts];
      if (p.current !== '') list.push(p.current);
      if (countOpen(list) <= 0) return p; // band karne ke liye khula nahi
      const last = list[list.length - 1];
      if (last === '(') {
        // khali pair — '(' wapas hata do (dangling implicit × bhi saaf)
        list = list.slice(0, -1);
        while (list.length > 0 && isOp(list[list.length - 1])) list.pop();
        return { ...p, parts: list, current: '', resultDisplay: null };
      }
      if (isOp(last)) {
        // "(5+)" type — op drop karke band: (5+3) → (5)
        list = list.slice(0, -1);
      }
      list.push(')');
      return { ...p, parts: list, current: '', resultDisplay: null };
    });
  }, []);

  /** x² — aakhri number ya bracket group ka square; op/"(" /khali par no-op */
  const square = useCallback(() => {
    setState((p) => {
      if (p.justEvaluated && p.resultDisplay) {
        const v = parseFloat(p.resultDisplay);
        if (isNaN(v)) return p;
        const next = numToString(roundForDisplay(v * v, decimals));
        return {
          ...p,
          resultDisplay: next,
          committedExpr: `${p.committedExpr}${SQUARE}`,
        };
      }
      const list: Token[] = [...p.parts];
      if (p.current !== '') {
        list.push(p.current, SQUARE);
        return { ...p, parts: list, current: '', resultDisplay: null };
      }
      const last = list[list.length - 1];
      if (last === ')' || last === SQUARE) {
        list.push(SQUARE);
        return { ...p, parts: list, resultDisplay: null };
      }
      return p; // "(−5" jaisa adhoora ya op ke baad — no-op
    });
  }, [decimals]);

  const negate = useCallback(() => {
    setState((p) => {
      if (p.justEvaluated && p.resultDisplay) {
        const cur = p.resultDisplay;
        return { ...p, resultDisplay: cur.startsWith('-') ? cur.slice(1) : `-${cur}` };
      }
      if (p.current !== '') {
        const next = p.current.startsWith('-') ? p.current.slice(1) : `-${p.current}`;
        return { ...p, current: next, resultDisplay: null };
      }
      const last = p.parts[p.parts.length - 1];
      if (typeof last === 'string' && isNumToken(last)) {
        const parts = [...p.parts];
        parts.pop();
        return { ...p, parts, current: last.startsWith('-') ? last.slice(1) : `-${last}`, resultDisplay: null };
      }
      return p;
    });
  }, []);

  /** % — aakhri number (current ya tokens ka) ÷100 */
  const percent = useCallback(() => {
    setState((p) => {
      if (p.justEvaluated && p.resultDisplay) {
        const v = parseFloat(p.resultDisplay);
        if (!isNaN(v)) return { ...p, resultDisplay: numToString(v / 100) };
        return p;
      }
      if (p.current !== '') {
        return { ...p, current: numToString(parseFloat(p.current) / 100), resultDisplay: null };
      }
      return p;
    });
  }, []);

  /** Operator: current commit + op push/replace; "(" ke baad op ignore */
  const setOperator = useCallback((op: Op) => {
    setState((p) => {
      if (p.justEvaluated && p.resultDisplay) {
        // result se aage: 47 + ...
        return {
          ...p,
          parts: [p.resultDisplay, op],
          current: '',
          resultDisplay: null,
          justEvaluated: false,
          committedExpr: '',
        };
      }
      const parts = [...p.parts];
      if (p.current !== '') {
        parts.push(p.current);
      }
      const last = parts[parts.length - 1];
      if (isOp(last)) {
        parts[parts.length - 1] = op; // double operator replace
        return { ...p, parts, current: '', resultDisplay: null };
      }
      if (last === '(') return p; // "(+" invalid
      if (parts.length > 0 && endsLikeValue(parts)) {
        parts.push(op);
        return { ...p, parts, current: '', resultDisplay: null };
      }
      return p; // khali — operator ignore
    });
  }, []);

  /** ⌫ — aakhri token/digit hatao; ')' ya '²' to wo, op ke baad pichla number edit */
  const backspace = useCallback(() => {
    setState((p) => {
      if (p.justEvaluated && p.resultDisplay) {
        const cur = p.resultDisplay;
        return freshStart({ current: cur.slice(0, -1) }, p);
      }
      if (p.current !== '') {
        const cut = p.current.slice(0, -1);
        return { ...p, current: cut === '-' ? '' : cut, resultDisplay: null };
      }
      const last = p.parts[p.parts.length - 1];
      if (last === undefined) return p;
      if (isOp(last)) {
        const list = p.parts.slice(0, -1);
        const newLast = list[list.length - 1];
        if (typeof newLast === 'string' && isNumToken(newLast)) {
          list.pop();
          return { ...p, parts: list, current: newLast, resultDisplay: null };
        }
        return { ...p, parts: list, resultDisplay: null };
      }
      // number/'('/')'/'²' token delete
      const list = p.parts.slice(0, -1);
      if (isNumToken(last)) {
        // number ko edit mein wapas laa do
        return { ...p, parts: list, current: last, resultDisplay: null };
      }
      return { ...p, parts: list, resultDisplay: null };
    });
  }, []);

  /** "=" — autoclose brackets, parser chalao, ek hi history entry */
  const evaluate = useCallback(() => {
    setState((p) => {
      if (p.justEvaluated) return p;
      const list = buildEvalList(p.parts, p.current, true);
      if (list.length < 2) return p; // sirf ek number ya khali
      const raw = evalTokenList(list);
      if (Number.isNaN(raw) || !isFinite(raw)) {
        return engineError(p); // ÷0 / malformed — history NAHI
      }
      const finalList: Token[] = [...list];
      // autoclosed "(" dikhane: jitne '(' khule the, list mein ')' push ho chuke
      const expr = renderTokens(finalList);
      const result = numToString(roundForDisplay(raw, decimals));
      return {
        parts: [],
        current: '',
        resultDisplay: result,
        justEvaluated: true,
        committedExpr: expr,
        calcTick: p.calcTick + 1,
        calcTs: Date.now(),
      };
    });
  }, [decimals]);

  /** History restore: result naye calc ke tor par load */
  const restore = useCallback((result: string) => {
    setState((p) => ({
      parts: [],
      current: '',
      resultDisplay: result,
      justEvaluated: true,
      committedExpr: '',
      calcTick: p.calcTick,
      calcTs: p.calcTs,
    }));
  }, []);

  return {
    state, clear, inputDigit, inputDot, backspace,
    negate, percent, openParen, closeParen, square,
    setOperator, evaluate, restore,
  };
}

/* ------------------------------------------------------------------ */
/* CalcButton — full pill, center label, scale 0.96 press, haptic      */
/* ------------------------------------------------------------------ */

function CalcButton(props: {
  label: string;
  onPress: () => void;
  fontSize: number;
  fontWeight?: '300' | '400' | '500' | '600' | '700';
  textColor: string;
  bgColor: string;
  active?: boolean;
  activeBg?: string;
  activeText?: string;
  haptics: boolean;
  accessibilityLabel: string;
  wrapFlex?: StyleProp<ViewStyle>;
}) {
  const { label, onPress, fontSize, fontWeight = '600', textColor, bgColor, active, activeBg, activeText, haptics, accessibilityLabel, wrapFlex } = props;
  const scale = useAnimatedValue(1);

  const handlePressIn = () => {
    Animated.spring(scale, { toValue: 0.96, useNativeDriver: true, speed: 40, bounciness: 4 }).start();
  };

  const handlePressOut = () => {
    Animated.spring(scale, { toValue: 1, useNativeDriver: true, speed: 30, bounciness: 6 }).start();
  };

  const handlePress = () => {
    if (haptics) Haptics.selectionAsync().catch(() => {});
    onPress();
  };

  return (
    <Animated.View style={[styles.keyBtnWrap, wrapFlex, { transform: [{ scale }] }]}>
      <Pressable
        onPress={handlePress}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel}
        style={[
          styles.calcButton,
          {
            borderRadius: 999, // full pill/oval
            backgroundColor: active ? (activeBg ?? bgColor) : bgColor,
          },
        ]}
      >
        <Text
          style={[
            styles.calcButtonText,
            { color: active ? (activeText ?? textColor) : textColor, fontSize, fontWeight },
          ]}
        >
          {label}
        </Text>
      </Pressable>
    </Animated.View>
  );
}

/* ------------------------------------------------------------------ */
/* Cursor — patla blinking bar (Animated opacity loop)                 */
/* ------------------------------------------------------------------ */

function Cursor(props: { color: string; height: number }) {
  const { color, height } = props;
  const blink = useAnimatedValue(1);

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(blink, { toValue: 0.15, duration: 420, useNativeDriver: true }),
        Animated.timing(blink, { toValue: 1, duration: 420, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [blink]);

  return (
    <Animated.View
      pointerEvents="none"
      style={[styles.cursor, { backgroundColor: color, height }, { opacity: blink }]}
    />
  );
}

/* ------------------------------------------------------------------ */
/* DisplayCard — BADA live expression + neeche chhota live result      */
/* ------------------------------------------------------------------ */

function DisplayCard(props: {
  bigText: string;
  cursorVisible: boolean;
  smallText: string;
  smallVisible: boolean;
  palette: Palette;
}) {
  const { bigText, cursorVisible, smallText, smallVisible, palette } = props;
  return (
    <View style={[styles.displayCard, { backgroundColor: palette.card, borderColor: palette.cardBorder }]}>
      <View style={styles.displayBigRow}>
        <Text
          style={[styles.displayBig, { color: palette.displayText }]}
          numberOfLines={1}
          adjustsFontSizeToFit
          minimumFontScale={0.35}
        >
          {bigText}
        </Text>
        {cursorVisible && (
          <>
            <Text style={[styles.displayBig, { color: palette.displayText }]}>{' '}</Text>
            <Cursor color={palette.operatorBg} height={40} />
          </>
        )}
      </View>

      <Text
        style={[styles.displaySmall, { color: palette.secondary }, !smallVisible && styles.displaySmallHidden]}
        numberOfLines={1}
        adjustsFontSizeToFit
      >
        {smallVisible && smallText !== '' ? smallText : ' '}
      </Text>
    </View>
  );
}

/* ------------------------------------------------------------------ */
/* SwipeRow — PanResponder swipe delete                                */
/* ------------------------------------------------------------------ */

function makeSwipePanResponder(
  translate: Animated.Value,
  onDelete: () => void,
  deletingRef: { current: boolean },
): PanResponderInstance {
  return PanResponder.create({
    onMoveShouldSetPanResponder: (_e, g) => Math.abs(g.dx) > 10 && Math.abs(g.dx) > Math.abs(g.dy) * 1.5,
    onPanResponderMove: (_e, g) => translate.setValue(g.dx),
    onPanResponderRelease: (_e, g) => {
      if (Math.abs(g.dx) > 90) {
        deletingRef.current = true;
        Animated.timing(translate, {
          toValue: g.dx > 0 ? 420 : -420,
          duration: 180,
          useNativeDriver: true,
        }).start(() => onDelete());
      } else {
        Animated.spring(translate, { toValue: 0, useNativeDriver: true }).start();
      }
    },
    onPanResponderTerminate: () => {
      if (!deletingRef.current) {
        Animated.spring(translate, { toValue: 0, useNativeDriver: true }).start();
      }
    },
  });
}

function SwipeRow(props: {
  children: React.ReactNode;
  onDelete: () => void;
  rowBg: string;
  style?: StyleProp<ViewStyle>;
  hidden?: boolean;
}) {
  const { children, onDelete, rowBg, style, hidden } = props;
  const translate = useAnimatedValue(0);
  const deleting = useMemo(() => ({ current: false }), []);
  const pan = useMemo(
    () => makeSwipePanResponder(translate, onDelete, deleting),
    [translate, onDelete, deleting],
  );

  return (
    <Animated.View
      {...(hidden ? {} : pan.panHandlers)}
      style={[style, { backgroundColor: rowBg, borderRadius: 18, overflow: 'hidden', transform: [{ translateX: hidden ? 0 : translate }] }]}
    >
      {children}
    </Animated.View>
  );
}

/* ------------------------------------------------------------------ */
/* BottomSheetShell — Modal built-in slide + fade overlay              */
/* ------------------------------------------------------------------ */

function BottomSheetShell(props: {
  visible: boolean;
  onClose: () => void;
  palette: Palette;
  title: string;
  accent?: string;
  children: React.ReactNode;
  maxHeightPct?: number;
  hideDefaultHeader?: boolean;
}) {
  const { visible, onClose, palette, title, accent, children, maxHeightPct, hideDefaultHeader } = props;
  const overlayOpacity = useAnimatedValue(0);

  useEffect(() => {
    Animated.timing(overlayOpacity, {
      toValue: visible ? 1 : 0,
      duration: 220,
      useNativeDriver: true,
    }).start();
  }, [visible, overlayOpacity]);

  const sheetHeight = maxHeightPct !== undefined ? (`${maxHeightPct}%` as const) : undefined;

  return (
    <Modal transparent visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={styles.sheetRoot}>
        <Pressable onPress={onClose} style={StyleSheet.absoluteFill} accessibilityLabel={`Close ${title}`}>
          <Animated.View
            style={[StyleSheet.absoluteFill, { backgroundColor: palette.overlay, opacity: overlayOpacity }]}
          />
        </Pressable>
        <View
          style={[
            styles.sheet,
            { backgroundColor: palette.sheet, shadowColor: '#000' },
            sheetHeight !== undefined ? { maxHeight: sheetHeight } : undefined,
          ]}
        >
          <View style={[styles.sheetHandle, { backgroundColor: palette.dimmed }]} />
          {!hideDefaultHeader && (
            <View style={styles.sheetHeader}>
              <Text style={[styles.sheetTitle, { color: accent ?? palette.sheetText }]}>{title}</Text>
              <Pressable
                onPress={onClose}
                accessibilityRole="button"
                accessibilityLabel={`Close ${title}`}
                hitSlop={8}
                style={styles.sheetCloseBtn}
              >
                <Text style={[styles.sheetClose, { color: palette.sheetText }]}>✕</Text>
              </Pressable>
            </View>
          )}
          {children}
        </View>
      </View>
    </Modal>
  );
}

/* ------------------------------------------------------------------ */
/* SplashLoader — app open hone par animated loader                    */
/* ------------------------------------------------------------------ */

function PulseRing({ anim, color }: { anim: Animated.Value; color: string }) {
  return (
    <Animated.View
      pointerEvents="none"
      style={{
        position: 'absolute',
        width: 110,
        height: 110,
        borderRadius: 55,
        borderWidth: 2,
        borderColor: color,
        opacity: anim.interpolate({ inputRange: [0, 0.4, 1], outputRange: [0, 0.45, 0] }),
        transform: [{ scale: anim.interpolate({ inputRange: [0, 1], outputRange: [0.65, 1.55] }) }],
      }}
    />
  );
}

function SplashLoader({ palette }: { palette: Palette }) {
  const ring1 = useAnimatedValue(0);
  const ring2 = useAnimatedValue(0);
  const ring3 = useAnimatedValue(0);
  const iconScale = useAnimatedValue(0.8);

  useEffect(() => {
    // icon bounce in
    Animated.spring(iconScale, {
      toValue: 1,
      useNativeDriver: true,
      speed: 14,
      bounciness: 10,
    }).start();

    // staggered pulse rings loop
    const pulse = (anim: Animated.Value, delay: number) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay(delay),
          Animated.timing(anim, { toValue: 1, duration: 900, useNativeDriver: true }),
          Animated.timing(anim, { toValue: 0, duration: 0, useNativeDriver: true }),
        ]),
      );

    const l1 = pulse(ring1, 0);
    const l2 = pulse(ring2, 280);
    const l3 = pulse(ring3, 560);
    l1.start(); l2.start(); l3.start();
    return () => { l1.stop(); l2.stop(); l3.stop(); };
  }, [ring1, ring2, ring3, iconScale]);

  return (
    <View style={styles.loaderCenter}>
      <PulseRing anim={ring1} color={palette.equalsBg} />
      <PulseRing anim={ring2} color={palette.equalsBg} />
      <PulseRing anim={ring3} color={palette.equalsBg} />

      <Animated.View
        style={[
          styles.loaderIcon,
          {
            backgroundColor: palette.equalsBg,
            transform: [{ scale: iconScale }],
          },
        ]}
      >
        <Text style={styles.loaderIconText}>=</Text>
      </Animated.View>

      <Text style={[styles.loaderLabel, { color: palette.entryMeta }]}>Calculator</Text>
    </View>
  );
}

/* ------------------------------------------------------------------ */
/* ConfirmClearModal — custom clear-history dialog                     */
/* ------------------------------------------------------------------ */

function ConfirmClearModal(props: {
  visible: boolean;
  count: number;
  palette: Palette;
  haptics: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const { visible, count, palette, haptics, onCancel, onConfirm } = props;
  const appear = useAnimatedValue(0);

  useEffect(() => {
    Animated.timing(appear, { toValue: visible ? 1 : 0, duration: 160, useNativeDriver: true }).start();
  }, [visible, appear]);

  useEffect(() => {
    if (visible) {
      Animated.spring(appear, {
        toValue: 1,
        useNativeDriver: true,
        speed: 22,
        bounciness: 6,
      }).start();
    }
  }, [visible, appear]);

  const handleConfirm = () => {
    if (haptics) Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {});
    onConfirm();
  };

  return (
    <Modal transparent visible={visible} animationType="fade" onRequestClose={onCancel}>
      <View style={styles.confirmRoot}>
        <Pressable onPress={onCancel} style={StyleSheet.absoluteFill} accessibilityLabel="Close clear history dialog" />
        <Animated.View
          style={[
            styles.confirmCard,
            { backgroundColor: palette.sheet },
            {
              opacity: appear,
              transform: [{ scale: appear.interpolate({ inputRange: [0, 1], outputRange: [0.9, 1] }) }],
            },
          ]}
        >
          <View style={[styles.confirmIconWrap, { backgroundColor: palette.clearBg }]}>
            <Text style={[styles.confirmIcon, { color: palette.clearText }]}>🗑️</Text>
          </View>
          <Text style={[styles.confirmTitle, { color: palette.sheetText }]}>Clear history?</Text>
          <Text style={[styles.confirmMessage, { color: palette.entryMeta }]}>
            Ye {count} calculation{count === 1 ? '' : 's'} hamesha ke liye delete ho jayengi.
          </Text>
          <View style={styles.confirmButtons}>
            <Pressable
              onPress={onCancel}
              accessibilityRole="button"
              accessibilityLabel="Cancel"
              style={({ pressed }) => [
                styles.confirmBtn,
                { backgroundColor: palette.sheetEntry },
                pressed && { opacity: 0.8 },
              ]}
            >
              <Text style={[styles.confirmBtnText, { color: palette.sheetText }]}>Cancel</Text>
            </Pressable>
            <Pressable
              onPress={handleConfirm}
              accessibilityRole="button"
              accessibilityLabel="Clear all history"
              style={({ pressed }) => [
                styles.confirmBtn,
                { backgroundColor: '#DC2626' },
                pressed && { opacity: 0.85 },
              ]}
            >
              <Text style={[styles.confirmBtnText, { color: '#FFFFFF' }]}>Clear all</Text>
            </Pressable>
          </View>
        </Animated.View>
      </View>
    </Modal>
  );
}

/* ------------------------------------------------------------------ */
/* ConfirmDeleteModal — single entry delete dialog                     */
/* ------------------------------------------------------------------ */

function ConfirmDeleteModal(props: {
  visible: boolean;
  palette: Palette;
  haptics: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const { visible, palette, haptics, onCancel, onConfirm } = props;
  const appear = useAnimatedValue(0);

  useEffect(() => {
    if (visible) {
      Animated.spring(appear, { toValue: 1, useNativeDriver: true, speed: 22, bounciness: 6 }).start();
    } else {
      Animated.timing(appear, { toValue: 0, duration: 140, useNativeDriver: true }).start();
    }
  }, [visible, appear]);

  const handleConfirm = () => {
    if (haptics) Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {});
    onConfirm();
  };

  return (
    <Modal transparent visible={visible} animationType="fade" onRequestClose={onCancel}>
      <View style={styles.confirmRoot}>
        <Pressable onPress={onCancel} style={StyleSheet.absoluteFill} accessibilityLabel="Close delete dialog" />
        <Animated.View
          style={[
            styles.confirmCard,
            { backgroundColor: palette.sheet },
            {
              opacity: appear,
              transform: [{ scale: appear.interpolate({ inputRange: [0, 1], outputRange: [0.9, 1] }) }],
            },
          ]}
        >
          <View style={[styles.confirmIconWrap, { backgroundColor: '#FEE2E2' }]}>
            <Text style={[styles.confirmIcon, { color: '#DC2626' }]}>🗑️</Text>
          </View>
          <Text style={[styles.confirmTitle, { color: palette.sheetText }]}>Delete entry?</Text>
          <Text style={[styles.confirmMessage, { color: palette.entryMeta }]}>
            Ye calculation hamesha ke liye delete ho jayegi.
          </Text>
          <View style={styles.confirmButtons}>
            <Pressable
              onPress={onCancel}
              accessibilityRole="button"
              accessibilityLabel="Cancel"
              style={({ pressed }) => [
                styles.confirmBtn,
                { backgroundColor: palette.sheetEntry },
                pressed && { opacity: 0.8 },
              ]}
            >
              <Text style={[styles.confirmBtnText, { color: palette.sheetText }]}>Cancel</Text>
            </Pressable>
            <Pressable
              onPress={handleConfirm}
              accessibilityRole="button"
              accessibilityLabel="Delete entry"
              style={({ pressed }) => [
                styles.confirmBtn,
                { backgroundColor: '#DC2626' },
                pressed && { opacity: 0.85 },
              ]}
            >
              <Text style={[styles.confirmBtnText, { color: '#FFFFFF' }]}>Delete</Text>
            </Pressable>
          </View>
        </Animated.View>
      </View>
    </Modal>
  );
}

/* ------------------------------------------------------------------ */
/* ToolsSheet — Theme / Haptics / Decimal places                       */
/* ------------------------------------------------------------------ */

function ToolsSheet(props: {
  visible: boolean;
  onClose: () => void;
  palette: Palette;
  settings: Settings;
  onChange: (s: Partial<Settings>) => void;
  accent: string;
}) {
  const { visible, onClose, palette, settings, onChange, accent } = props;
  const themeOptions: { key: ThemeMode; label: string }[] = [
    { key: 'light', label: 'Light' },
    { key: 'dark', label: 'Dark' },
    { key: 'system', label: 'System' },
  ];

  const stepper = (dir: -1 | 1) => {
    onChange({ decimals: Math.min(10, Math.max(0, settings.decimals + dir)) });
  };

  return (
    <BottomSheetShell visible={visible} onClose={onClose} palette={palette} title="Tools" accent={accent}>
      <Text style={[styles.settingLabel, { color: palette.entryMeta }]}>Theme</Text>
      <View style={[styles.segmentWrap, { backgroundColor: palette.sheetEntry }]}>
        {themeOptions.map((t) => {
          const selected = settings.theme === t.key;
          return (
            <Pressable
              key={t.key}
              onPress={() => onChange({ theme: t.key })}
              accessibilityRole="button"
              accessibilityLabel={`Theme ${t.label}`}
              style={[styles.segment, selected && { backgroundColor: palette.card }]}
            >
              <Text style={[styles.segmentText, { color: selected ? palette.sheetText : palette.entryMeta }]}>
                {t.label}
              </Text>
            </Pressable>
          );
        })}
      </View>

      <View style={[styles.settingRow, { borderTopColor: palette.divider }]}>
        <Text style={[styles.settingLabelText, { color: palette.sheetText }]}>Haptic feedback</Text>
        <Switch
          value={settings.haptics}
          onValueChange={(v) => onChange({ haptics: v })}
          trackColor={{ true: palette.switchOn, false: palette.dimmed }}
          thumbColor="#FFFFFF"
        />
      </View>

      <View style={[styles.settingRow, { borderTopColor: palette.divider }]}>
        <Text style={[styles.settingLabelText, { color: palette.sheetText }]}>Decimal places</Text>
        <View style={styles.stepperRow}>
          <Pressable
            onPress={() => stepper(-1)}
            accessibilityRole="button"
            accessibilityLabel="Decrease decimal places"
            style={[styles.stepperBtn, { backgroundColor: palette.sheetEntry }]}
          >
            <Text style={[styles.stepperText, { color: palette.sheetText }]}>−</Text>
          </Pressable>
          <Text style={[styles.stepperValue, { color: palette.sheetText }]}>{settings.decimals}</Text>
          <Pressable
            onPress={() => stepper(1)}
            accessibilityRole="button"
            accessibilityLabel="Increase decimal places"
            style={[styles.stepperBtn, { backgroundColor: palette.sheetEntry }]}
          >
            <Text style={[styles.stepperText, { color: palette.sheetText }]}>+</Text>
          </Pressable>
        </View>
      </View>
    </BottomSheetShell>
  );
}

/* ------------------------------------------------------------------ */
/* HistorySheet — SectionList + swipe delete + copy + clear            */
/* ------------------------------------------------------------------ */

interface HistorySection {
  title: string;
  data: HistoryEntry[];
}

function HistorySheet(props: {
  visible: boolean;
  onClose: () => void;
  palette: Palette;
  history: HistoryEntry[];
  onRestore: (e: HistoryEntry) => void;
  onDeleteEntry: (id: string) => void;
  onDeleteMany: (ids: string[]) => void;
  onClear: () => void;
  haptics: boolean;
  snackbar: { message: string; undo: () => void } | null;
}) {
  const {
    visible, onClose, palette, history, onRestore,
    onDeleteEntry, onDeleteMany, onClear, haptics, snackbar,
  } = props;
  const [selectMode, setSelectMode] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  // sheet band hone par select mode reset
  const closeSheet = () => {
    setSelectMode(false);
    setSelected(new Set());
    onClose();
  };

  const enterSelect = useCallback((firstId: string) => {
    if (haptics) Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    setSelectMode(true);
    setSelected(new Set([firstId]));
  }, [haptics]);

  const toggleSelect = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      if (next.size === 0) setSelectMode(false); // sab deselect => mode band
      return next;
    });
  };

  const selectAll = () => {
    setSelected(new Set(history.map((e) => e.id)));
    if (haptics) Haptics.selectionAsync().catch(() => {});
  };

  const deleteSelected = () => {
    const ids = [...selected];
    onDeleteMany(ids);
    setSelectMode(false);
    setSelected(new Set());
  };

  const tapEntry = (e: HistoryEntry) => {
    if (selectMode) toggleSelect(e.id);
    else onRestore(e);
  };

  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);

  const sections = useMemo<HistorySection[]>(() => {
    const sorted = [...history].sort((a, b) => b.ts - a.ts);
    const out: HistorySection[] = [];
    for (const e of sorted) {
      const label = groupLabel(e.ts);
      const last = out[out.length - 1];
      if (last && last.title === label) last.data.push(e);
      else out.push({ title: label, data: [e] });
    }
    return out;
  }, [history]);

  return (
    <BottomSheetShell visible={visible} onClose={closeSheet} palette={palette} title="" maxHeightPct={70} hideDefaultHeader>
      {/* ---------- Header: clear all + X | select mode: Cancel + trash + Select all ---------- */}
      <View style={styles.sheetHeader}>
        {selectMode ? (
          <>
            <Pressable onPress={closeSheet} accessibilityRole="button" accessibilityLabel="Cancel selection">
              <Text style={[styles.headerChipText, { color: palette.operatorBg }]}>Cancel</Text>
            </Pressable>
            <Text style={[styles.sheetTitle, { color: palette.sheetText, flex: 1, textAlign: 'center', fontSize: 16 }]}>
              {selected.size} selected
            </Text>
            <View style={styles.headerRight}>
              <Pressable onPress={selectAll} accessibilityRole="button" accessibilityLabel="Select all entries">
                <Text style={[styles.headerChipText, { color: palette.operatorBg }]}>Select all</Text>
              </Pressable>
              <Pressable
                onPress={deleteSelected}
                disabled={selected.size === 0}
                accessibilityRole="button"
                accessibilityLabel="Delete selected entries"
                style={styles.iconBtn}
              >
                <Text style={[styles.iconBtnText, { opacity: selected.size === 0 ? 0.4 : 1, color: '#DC2626' }]}>🗑️</Text>
              </Pressable>
            </View>
          </>
        ) : (
          <>
            <Text style={[styles.sheetTitle, { color: palette.operatorBg }]}>History</Text>
            <View style={styles.headerRight}>
              <Pressable
                onPress={onClear}
                disabled={history.length === 0}
                accessibilityRole="button"
                accessibilityLabel="Clear all history"
                hitSlop={8}
              >
                <Text
                  style={[
                    styles.headerChipText,
                    { color: '#DC2626', opacity: history.length === 0 ? 0.35 : 1 },
                  ]}
                >
                  Clear all
                </Text>
              </Pressable>
              <Pressable
                onPress={closeSheet}
                accessibilityRole="button"
                accessibilityLabel="Close history"
                hitSlop={8}
                style={styles.sheetCloseBtn}
              >
                <Text style={[styles.sheetClose, { color: palette.sheetText }]}>✕</Text>
              </Pressable>
            </View>
          </>
        )}
      </View>

      {history.length === 0 ? (
        <View style={styles.historyEmpty}>
          <Text style={[styles.historyEmptyIcon, { color: palette.dimmed }]}>🕒</Text>
          <Text style={[styles.historyEmptyText, { color: palette.entryMeta }]}>Abhi koi calculation nahi</Text>
        </View>
      ) : (
        <SectionList
          sections={sections}
          keyExtractor={(item) => item.id}
          style={styles.historyList}
          contentContainerStyle={styles.historyListContent}
          SectionSeparatorComponent={() => <View style={{ height: 8 }} />}
          renderSectionHeader={({ section }) => (
            <Text style={[styles.historySectionTitle, { color: palette.entryMeta }]}>{section.title}</Text>
          )}
          renderItem={({ item }) => {
            const isSelected = selected.has(item.id);
            return (
              <SwipeRow
                onDelete={() => setDeleteConfirmId(item.id)}
                rowBg="#DC2626"
                style={styles.swipeRow}
                hidden={selectMode}
              >
                <Pressable
                  onPress={() => tapEntry(item)}
                  onLongPress={selectMode ? undefined : () => enterSelect(item.id)}
                  accessibilityRole="button"
                  accessibilityLabel={`History ${item.expression} equals ${item.result}`}
                  style={[
                    styles.historyEntryCard,
                    { backgroundColor: palette.sheetEntry },
                    selectMode && isSelected && { borderColor: palette.operatorBg, borderWidth: 2 },
                  ]}
                >
                  {/* selected-mode checkbox */}
                  {selectMode && (
                    <View
                      style={[
                        styles.checkbox,
                        { borderColor: palette.dimmed, backgroundColor: isSelected ? palette.operatorBg : 'transparent' },
                      ]}
                    >
                      {isSelected && <Text style={styles.checkboxTick}>{'✓'}</Text>}
                    </View>
                  )}

                  <View style={styles.historyEntryMain}>
                    <Text style={[styles.historyTime, { color: palette.entryMeta }]}>{timeLabel(item.ts)}</Text>
                    <Text style={[styles.historyExpression, { color: palette.entryMeta }]} numberOfLines={1}>
                      {item.expression}
                    </Text>
                    <Text style={[styles.historyResult, { color: palette.sheetText }]} numberOfLines={1}>
                      {commify(item.result)}
                    </Text>
                  </View>

                  {/* delete button (sirf normal mode mein) */}
                  {!selectMode && (
                    <Pressable
                      onPress={() => setDeleteConfirmId(item.id)}
                      accessibilityRole="button"
                      accessibilityLabel="Delete entry"
                      hitSlop={8}
                      style={styles.iconBtn}
                    >
                      <Text style={[styles.iconBtnText, { color: '#DC2626' }]}>🗑️</Text>
                    </Pressable>
                  )}
                </Pressable>
              </SwipeRow>
            );
          }}
        />
      )}

      {/* ---------- Undo snackbar (4s) ---------- */}
      {snackbar !== null && (
        <Animated.View style={[styles.snackBar, { backgroundColor: palette.toast }]}>
          <Text style={[styles.snackBarText, { color: palette.toastText }]}>{snackbar.message}</Text>
          <Pressable
            onPress={snackbar.undo}
            accessibilityRole="button"
            accessibilityLabel="Undo delete"
            hitSlop={8}
          >
            <Text style={[styles.snackBarUndo, { color: palette.operatorBg }]}>Undo</Text>
          </Pressable>
        </Animated.View>
      )}

      {/* ---------- Single-entry delete confirm ---------- */}
      <ConfirmDeleteModal
        visible={deleteConfirmId !== null}
        palette={palette}
        haptics={haptics}
        onCancel={() => setDeleteConfirmId(null)}
        onConfirm={() => {
          if (deleteConfirmId) onDeleteEntry(deleteConfirmId);
          setDeleteConfirmId(null);
        }}
      />
    </BottomSheetShell>
  );
}

/* ------------------------------------------------------------------ */
/* Main App                                                            */
/* ------------------------------------------------------------------ */

export default function Calculator() {
  const systemScheme = useColorScheme();
  const insets = useSafeAreaInsets();

  // ---- Settings (AsyncStorage) ----
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [settingsLoaded, setSettingsLoaded] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem(SETTINGS_KEY)
      .then((raw) => {
        if (raw) {
          const parsed = JSON.parse(raw) as Partial<Settings>;
          setSettings((s) => ({
            theme: parsed.theme ?? s.theme,
            haptics: parsed.haptics ?? s.haptics,
            decimals:
              typeof parsed.decimals === 'number' ? Math.min(10, Math.max(0, parsed.decimals)) : s.decimals,
          }));
        }
      })
      .catch(() => {})
      .finally(() => setSettingsLoaded(true));
  }, []);

  useEffect(() => {
    if (!settingsLoaded) return;
    AsyncStorage.setItem(SETTINGS_KEY, JSON.stringify(settings)).catch(() => {});
  }, [settings, settingsLoaded]);

  const updateSettings = useCallback((patch: Partial<Settings>) => {
    setSettings((s) => ({ ...s, ...patch }));
  }, []);

  // ---- Effective theme ----
  const palette = useMemo<Palette>(() => {
    const dark = settings.theme === 'dark' || (settings.theme === 'system' && systemScheme === 'dark');
    return dark ? DARK : LIGHT;
  }, [settings.theme, systemScheme]);
  const isDark = palette === DARK;

  // ---- History (AsyncStorage, max 100) ----
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [toolsOpen, setToolsOpen] = useState(false);
  // ---- Undo snackbar (delete/clear ke liye, 4s auto-hide) ----
  const [snackbar, setSnackbar] = useState<{ message: string; undo: () => void } | null>(null);
  const [undoTimerId, setUndoTimerId] = useState(-1);

  function pushUndo(message: string, restore: () => void) {
    if (undoTimerId !== -1) clearTimeout(undoTimerId);
    setSnackbar({
      message,
      undo: () => {
        setUndoTimerId(-1);
        setSnackbar(null);
        LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
        restore();
      },
    });
    setUndoTimerId(setTimeout(() => setSnackbar(null), 4000));
  }

  function makeRestoreAt(entry: HistoryEntry, index: number) {
    return () => {
      setHistory((prev) => {
        const copy = [...prev];
        copy.splice(Math.min(index, copy.length), 0, entry);
        return copy;
      });
    };
  }

  // ek entry delete (trash icon ya swipe) — Undo ke saath
  function deleteEntry(id: string) {
    const idx = history.findIndex((en) => en.id === id);
    if (idx === -1) return;
    const entry = history[idx];
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setHistory((prev) => prev.filter((en) => en.id !== id));
    pushUndo('Calculation delete hui', makeRestoreAt(entry, idx));
  }

  // select mode bulk delete — ek hi snackbar
  function deleteMany(ids: string[]) {
    const snapshot = history;
    const removed = ids.filter((id) => snapshot.some((en) => en.id === id));
    if (removed.length === 0) return;
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setHistory((prev) => prev.filter((en) => !ids.includes(en.id)));
    pushUndo(`Ye ${removed.length} calculation${removed.length === 1 ? '' : 's'} delete hui`, () => {
      setHistory(snapshot);
    });
  }

  const [confirmClearOpen, setConfirmClearOpen] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem(HISTORY_KEY)
      .then((raw) => {
        if (raw) {
          const parsed = JSON.parse(raw) as HistoryEntry[];
          if (Array.isArray(parsed)) setHistory(parsed.slice(0, MAX_HISTORY));
        }
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    AsyncStorage.setItem(HISTORY_KEY, JSON.stringify(history)).catch(() => {});
  }, [history]);

  const engine = useCalculatorEngine(settings.decimals);
  const { state } = engine;

  /**
   * "=" handler — yahin hi history entry save hoti hai (event handler,
   * render-nahin, is liye reliable). Engine sirf display state sambhalta hai.
   */
  function handleEquals() {
    const list = buildEvalList(state.parts, state.current, true);
    const raw = evalTokenList(list);
    if (list.length >= 2 && !Number.isNaN(raw) && isFinite(raw)) {
      const entry: HistoryEntry = {
        id: nextCalcId(),
        expression: renderTokens(list),
        result: numToString(roundForDisplay(raw, settings.decimals)),
        ts: nowMs(),
      };
      setHistory((prev) => [entry, ...prev].slice(0, MAX_HISTORY));
    }
    engine.evaluate();
  }

  // ---- Display derivation (pure) ----
  const live = liveResultOf(state.parts, state.current, settings.decimals);

  const bigText: string = state.justEvaluated
    ? state.resultDisplay
      ? commify(state.resultDisplay)
      : ''
    : renderTokens(state.parts) + (state.current === '' ? '' : renderNumber(state.current));

  // "=" ke baad neeche line HIDE (opacity 0, height reserved — layout na hile)
  const smallText: string = commify(live.value);
  const smallVisible: boolean = !state.justEvaluated;
  const cursorVisible: boolean = !state.justEvaluated && state.resultDisplay !== 'Error';

  // ---- Clear history flow (custom modal, Alert nahi) ----
  function handleClearRequest() {
    if (history.length === 0) return;
    setHistoryOpen(false);
    setConfirmClearOpen(true);
  }

  function handleClearConfirm() {
    setConfirmClearOpen(false);
    const snapshot = history;
    setHistory([]);
    // sheet wapas khol kar Undo snackbar dikhao
    setHistoryOpen(true);
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    pushUndo('History saaf ho gayi', () => {
      setHistory(snapshot);
    });
  }

  // ---- Keypad config (span = kitne columns gherte hain) ----
  type Variant = 'number' | 'function' | 'operator' | 'equals';
  const keypad: [string, Variant, string, number?][][] = useMemo(
    () => [
      // patli top row: brackets + square
      [
        ['(', 'function', 'Open bracket'],
        [')', 'function', 'Close bracket'],
        ['x²', 'function', 'Square'],
        ['±', 'function', 'Toggle sign'],
      ],
      // normal rows
      [
        ['AC', 'function', 'All clear'],
        ['⌫', 'function', 'Backspace'],
        ['%', 'function', 'Percent'],
        ['÷', 'operator', 'Divide'],
      ],
      [
        ['7', 'number', 'Seven'],
        ['8', 'number', 'Eight'],
        ['9', 'number', 'Nine'],
        ['×', 'operator', 'Multiply'],
      ],
      [
        ['4', 'number', 'Four'],
        ['5', 'number', 'Five'],
        ['6', 'number', 'Six'],
        ['−', 'operator', 'Subtract'],
      ],
      [
        ['1', 'number', 'One'],
        ['2', 'number', 'Two'],
        ['3', 'number', 'Three'],
        ['+', 'operator', 'Add'],
      ],
      [
        ['0', 'number', 'Zero', 2], // double width
        ['.', 'number', 'Decimal point'],
        ['=', 'equals', 'Equals'],
      ],
    ],
    [],
  );

  const textColorFor = (variant: Variant) => {
    if (variant === 'operator') return palette.operatorText;
    if (variant === 'equals') return palette.equalsText;
    if (variant === 'function') return palette.functionText;
    return palette.numberText;
  };

  const bgColorFor = (variant: Variant) => {
    if (variant === 'operator') return palette.operatorBg;
    if (variant === 'equals') return palette.equalsBg;
    if (variant === 'function') return palette.functionBg;
    return palette.numberBg;
  };

  const dispatch = (label: string) => {
    switch (label) {
      case 'AC':
        engine.clear();
        break;
      case '⌫':
        engine.backspace();
        break;
      case '%':
        engine.percent();
        break;
      case '±':
        engine.negate();
        break;
      case '(':
        engine.openParen();
        break;
      case ')':
        engine.closeParen();
        break;
      case 'x²':
        engine.square();
        break;
      case '÷':
        engine.setOperator('÷');
        break;
      case '×':
        engine.setOperator('×');
        break;
      case '−':
        engine.setOperator('-');
        break;
      case '+':
        engine.setOperator('+');
        break;
      case '=':
        handleEquals();
        break;
      case '.':
        engine.inputDot();
        break;
      default:
        if (/^[0-9]$/.test(label)) engine.inputDigit(label);
        break;
    }
  };

  const lastPart = state.parts.length > 0 ? state.parts[state.parts.length - 1] : null;
  const activeOperatorLabel = lastPart !== null && isOp(lastPart) ? (lastPart === '-' ? '−' : lastPart) : null;

  // ---- Splash loader: settings load hone tak dikhao ----
  const loaderOpacity = useAnimatedValue(1);
  const [showLoader, setShowLoader] = useState(true);

  useEffect(() => {
    if (settingsLoaded) {
      // fade out loader
      Animated.timing(loaderOpacity, {
        toValue: 0,
        duration: 480,
        useNativeDriver: true,
      }).start(() => setShowLoader(false));
    }
  }, [settingsLoaded, loaderOpacity]);

  return (
    <View style={[styles.root, { backgroundColor: palette.bg }]}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} />
      {showLoader && (
        <Animated.View
          pointerEvents="none"
          style={[styles.loaderOverlay, { backgroundColor: palette.bg, opacity: loaderOpacity }]}
        >
          <SplashLoader palette={palette} />
        </Animated.View>
      )}
      <View style={styles.flexCol}>
        {/* ---------- Top section (flex: 0) ---------- */}
        <View style={[styles.topSection, { paddingTop: insets.top + 8 }]}>
          <View style={styles.toolbar}>
            <Pressable
              onPress={() => setToolsOpen(true)}
              accessibilityRole="button"
              accessibilityLabel="Open tools and settings"
              style={({ pressed }) => [
                styles.toolbarBtn,
                { backgroundColor: palette.toolbarBtn },
                pressed && { opacity: 0.7 },
              ]}
            >
              <Text style={styles.toolbarIcon}>{'⚙'}</Text>
            </Pressable>
            <Pressable
              onPress={() => updateSettings({ theme: isDark ? 'light' : 'dark' })}
              accessibilityRole="button"
              accessibilityLabel="Toggle theme"
              style={({ pressed }) => [
                styles.toolbarBtn,
                { backgroundColor: palette.toolbarBtn },
                pressed && { opacity: 0.7 },
              ]}
            >
              <Text style={styles.toolbarIcon}>{isDark ? '☾' : '☀'}</Text>
            </Pressable>
          </View>

          <DisplayCard
            bigText={bigText}
            cursorVisible={cursorVisible}
            smallText={smallText}
            smallVisible={smallVisible}
            palette={palette}
          />

          <View style={styles.pillRow}>
            <Pressable
              onPress={() => setHistoryOpen(true)}
              accessibilityRole="button"
              accessibilityLabel="Open calculation history"
              style={({ pressed }) => [
                styles.historyPill,
                { backgroundColor: palette.pillBg },
                pressed && { opacity: 0.75 },
              ]}
            >
              <Text style={{ fontSize: 13 }}>{'🕘'}</Text>
              <Text style={[styles.historyPillText, { color: palette.pillText }]}>
                {history.length} {history.length === 1 ? 'calculation' : 'calculations'}
              </Text>
            </Pressable>
          </View>
        </View>

        {/* ---------- Keypad — flex fill, patli bracket row, pill buttons ---------- */}
        <View style={[styles.keypad, { paddingBottom: Math.max(24, insets.bottom + 12) }]}>
          {keypad.map((row, rIdx) => (
            <View
              key={`row-${rIdx}`}
              style={rIdx === 0 ? styles.keyRowThin : styles.keyRow}
            >
              {row.map(([label, variant, a11y, span]) => {
                // Font size: row-0 symbols aur multi-char labels chote, baqi 30
                const btnFontSize = rIdx === 0 || label.length > 1 ? 26 : 30;
                // Font weight: symbols/function labels lighter, numbers & operators bold
                const lightLabels = new Set(['AC', '(', ')', '( )', 'x²', '±', '%', '⌫']);
                const btnFontWeight: '300' | '400' | '500' | '600' = lightLabels.has(label) ? '400' : '600';
                return (
                <CalcButton
                  key={label}
                  label={label}
                  onPress={() => dispatch(label)}
                  fontSize={btnFontSize}
                  fontWeight={btnFontWeight}
                  active={variant === 'operator' && label === activeOperatorLabel}
                  activeBg={palette.operatorActiveBg}
                  activeText={palette.operatorActiveText}
                  textColor={textColorFor(variant)}
                  bgColor={bgColorFor(variant)}
                  haptics={settings.haptics}
                  accessibilityLabel={a11y}
                  wrapFlex={span === 2 ? styles.keyBtnWrapDouble : undefined}
                />
                );
              })}
            </View>
          ))}
        </View>
      </View>

      {/* ---------- Sheets ---------- */}
      <ToolsSheet
        visible={toolsOpen}
        onClose={() => setToolsOpen(false)}
        palette={palette}
        settings={settings}
        onChange={updateSettings}
        accent={palette.operatorBg}
      />
      <HistorySheet
        visible={historyOpen}
        onClose={() => setHistoryOpen(false)}
        palette={palette}
        history={history}
        onRestore={restoreEntry}
        onDeleteEntry={deleteEntry}
        onDeleteMany={deleteMany}
        onClear={handleClearRequest}
        haptics={settings.haptics}
        snackbar={snackbar}
      />

      <ConfirmClearModal
        visible={confirmClearOpen}
        count={history.length}
        palette={palette}
        haptics={settings.haptics}
        onCancel={() => {
          setConfirmClearOpen(false);
          setHistoryOpen(true);
        }}
        onConfirm={handleClearConfirm}
      />
    </View>
  );

  function restoreEntry(e: HistoryEntry) {
    engine.restore(e.result);
    setHistoryOpen(false);
  }
}

/* ------------------------------------------------------------------ */
/* Styles                                                              */
/* ------------------------------------------------------------------ */

const styles = StyleSheet.create({
  root: {
    flex: 1,
    width: '100%',
    flexDirection: 'column',
  },
  flexCol: {
    flex: 1,
  },
  topSection: {
    flex: 0,
    paddingHorizontal: 20,
  },
  toolbar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginVertical: 8,
  },
  toolbarBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  toolbarIcon: {
    fontSize: 20,
    lineHeight: 24,
  },
  displayCard: {
    borderRadius: 28,
    borderWidth: 1,
    paddingHorizontal: 24,
    paddingTop: 28,
    paddingBottom: 24,
    minHeight: 160,
    alignItems: 'flex-end',
    justifyContent: 'flex-end',
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 6 },
    elevation: 4,
  },
  displayBigRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'flex-end',
    width: '100%',
  },
  displayBig: {
    fontSize: 52,
    fontWeight: '500',
  },
  cursor: {
    width: 2,
    borderRadius: 1,
    marginLeft: 3,
  },
  displaySmall: {
    fontSize: 28,
    fontWeight: '400',
    marginTop: 6,
    minHeight: 34,
  },
  displaySmallHidden: {
    opacity: 0,
  },
  pillRow: {
    alignItems: 'center',
    marginTop: 12,
  },
  historyPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 6,
    paddingHorizontal: 14,
    borderRadius: 16,
  },
  historyPillText: {
    fontSize: 13,
    fontWeight: '600',
  },
  keypad: {
    flex: 1,
    paddingHorizontal: 12,
    paddingTop: 8,
    gap: 8,
    marginTop: 12,
  },
  keyRow: {
    flex: 1,
    flexDirection: 'row',
    gap: 8,
  },
  keyRowThin: {
    flex: 0.75, // bracket row patli
    flexDirection: 'row',
    gap: 8,
  },
  keyBtnWrap: {
    flex: 1,
  },
  keyBtnWrapDouble: {
    flex: 2, // "0" double width
    zIndex: 1,
  },
  calcButton: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  calcButtonText: {
    fontWeight: '600',
  },
  confirmRoot: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
  },
  confirmCard: {
    width: '86%',
    maxWidth: 360,
    borderRadius: 28,
    padding: 24,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.25,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 10 },
    elevation: 10,
  },
  confirmIconWrap: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  confirmIcon: {
    fontSize: 28,
  },
  confirmTitle: {
    fontSize: 20,
    fontWeight: '700',
    textAlign: 'center',
    marginBottom: 8,
  },
  confirmMessage: {
    fontSize: 14,
    fontWeight: '400',
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 20,
  },
  confirmButtons: {
    flexDirection: 'row',
    gap: 12,
    alignSelf: 'stretch',
  },
  confirmBtn: {
    flex: 1,
    height: 52,
    borderRadius: 26,
    alignItems: 'center',
    justifyContent: 'center',
  },
  confirmBtnText: {
    fontSize: 16,
    fontWeight: '700',
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  headerChipText: {
    fontSize: 14,
    fontWeight: '700',
  },
  iconBtn: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 12,
  },
  iconBtnText: {
    fontSize: 18,
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxTick: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
    lineHeight: 16,
  },
  snackBar: {
    position: 'absolute',
    alignSelf: 'center',
    bottom: 84,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 20,
    shadowColor: '#000',
    shadowOpacity: 0.25,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },
  snackBarText: {
    fontSize: 13,
    fontWeight: '500',
  },
  snackBarUndo: {
    fontSize: 14,
    fontWeight: '700',
  },
  sheetRoot: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  sheet: {
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingHorizontal: 20,
    paddingTop: 10,
    paddingBottom: 24,
  },
  sheetHandle: {
    alignSelf: 'center',
    width: 44,
    height: 5,
    borderRadius: 3,
    marginBottom: 10,
  },
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  sheetTitle: {
    fontSize: 20,
    fontWeight: '700',
  },
  sheetCloseBtn: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sheetClose: {
    fontSize: 18,
    fontWeight: '600',
  },
  settingLabel: {
    fontSize: 13,
    fontWeight: '600',
    marginBottom: 8,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  segmentWrap: {
    flexDirection: 'row',
    borderRadius: 14,
    padding: 4,
    marginBottom: 16,
  },
  segment: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 10,
    alignItems: 'center',
  },
  segmentText: {
    fontSize: 14,
    fontWeight: '600',
  },
  settingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  settingLabelText: {
    fontSize: 16,
    fontWeight: '600',
  },
  stepperRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  stepperBtn: {
    width: 36,
    height: 36,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepperText: {
    fontSize: 20,
    fontWeight: '700',
  },
  stepperValue: {
    fontSize: 16,
    fontWeight: '700',
    minWidth: 24,
    textAlign: 'center',
  },
  historyList: {
    flexGrow: 0,
  },
  historyListContent: {
    paddingBottom: 8,
  },
  historySectionTitle: {
    fontSize: 13,
    fontWeight: '700',
    marginBottom: 8,
    marginTop: 4,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  swipeRow: {
    marginBottom: 8,
  },
  historyEntryCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 18,
    shadowColor: '#000',
    shadowOpacity: 0.07,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  historyEntryMain: {
    flex: 1,
  },
  historyExpression: {
    fontSize: 14,
    fontWeight: '500',
  },
  historyResult: {
    fontSize: 20,
    fontWeight: '700',
    marginTop: 2,
  },
  historyTime: {
    fontSize: 12,
    fontWeight: '500',
  },
  historyEmpty: {
    alignItems: 'center',
    paddingVertical: 36,
  },
  historyEmptyIcon: {
    fontSize: 44,
    marginBottom: 12,
  },
  historyEmptyText: {
    fontSize: 15,
    fontWeight: '500',
  },
  clearHistoryBtn: {
    alignItems: 'center',
    paddingVertical: 14,
    borderRadius: 16,
    marginTop: 8,
  },
  clearHistoryText: {
    fontSize: 16,
    fontWeight: '700',
  },
  toast: {
    position: 'absolute',
    alignSelf: 'center',
    bottom: 96,
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 20,
  },
  toastText: {
    fontSize: 14,
    fontWeight: '600',
  },
  // ---- Splash Loader ----
  loaderOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 999,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loaderCenter: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  loaderIcon: {
    width: 88,
    height: 88,
    borderRadius: 44,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#10B981',
    shadowOpacity: 0.35,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 4 },
    elevation: 8,
  },
  loaderIconText: {
    fontSize: 40,
    fontWeight: '300',
    color: '#FFFFFF',
    lineHeight: 48,
  },
  loaderLabel: {
    marginTop: 24,
    fontSize: 15,
    fontWeight: '500',
    letterSpacing: 0.5,
  },
});
