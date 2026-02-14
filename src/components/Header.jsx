export default function Header() {

  const handleAddModel = () => {
    alert("Model upload feature will be connected to backend.");
  };

  return (
    <header className="header">
      <h2>HOLOMED</h2>
      <button className="add-btn" onClick={handleAddModel}>
        + Add Model
      </button>
    </header>
  );
}
