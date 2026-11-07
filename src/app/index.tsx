import { StyleSheet, View } from 'react-native';
import Calculator from '../components/Calculator';

export default function CalculatorScreen() {
  // Screen ke top pad app andar khud sambhalta hai (StatusBar.currentHeight)
  return (
    <View style={styles.container}>
      <Calculator />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    width: '100%',
  },
});
