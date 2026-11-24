import { Link } from 'react-router-dom'
import { useProduct } from '../product.jsx'
import Board from '../components/Board.jsx'

export default function Pipeline() {
  const { product } = useProduct()
  return (
    <>
      <div className="head"><h2>Pipeline{product ? ` — ${product.name}` : ''}</h2></div>
      <p className="muted">Drag a deal card to another column to change its stage. Create deals by converting a <Link to="/leads">lead</Link> or from an account page. Set units and segment on a deal to track bulk deals.</p>
      <Board />
    </>
  )
}
