import CustomerList from '../components/CustomerList.jsx'

export default function Customers() {
  return (
    <>
      <div className="head"><h2>Customers</h2></div>
      <CustomerList searchable />
    </>
  )
}
