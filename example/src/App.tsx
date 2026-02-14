import { useState } from 'react'
import './App.css'

function App() {
	const [count, setCount] = useState(0)

	return (
		<div>
			<h1>Vite + React</h1>
			<button onClick={() => setCount((c) => c + 1)}>count is {count}</button>
		</div>
	)
}

export default App
