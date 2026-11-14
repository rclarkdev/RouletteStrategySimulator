export default function App() {
  return (
    <main className="foundation-shell">
      <section className="foundation-card" aria-labelledby="page-title">
        <p className="eyebrow">Project foundation</p>
        <h1 id="page-title">Roulette Strategy Simulator</h1>
        <p className="intro">
          The web foundation is ready. Strategy rules, simulation, saved
          results, and the 3D wheel have not been implemented.
        </p>
        <div className="status" role="status">
          <span className="status-indicator" aria-hidden="true" />
          <span>Foundation scaffold</span>
        </div>
        <p className="scope-note">
          Future simulations will be calculated by the Python service. This
          placeholder does not produce roulette outcomes or financial results.
        </p>
      </section>
    </main>
  );
}
