import HexagonalGrid from './components/HexagonalGrid';
import './App.css';

function App() {
  return (
    <div className="App">
      <header className="App-header">
        <h1>Hexagen - Infinite Hexagonal Grid</h1>
        <p>Scroll, zoom, and pan to explore the infinite hexagonal world</p>
      </header>
      <main className="App-main">
        <HexagonalGrid />
      </main>
    </div>
  );
}

export default App;
