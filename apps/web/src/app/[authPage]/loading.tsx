import { T } from "../../components/locale";
export default function LoadingAuth() {
  return (
    <main id="main" className="workspace-alone">
      <p className="loading" role="status">
        <T en="Loading the form…" it="Caricamento del modulo…" />
      </p>
    </main>
  );
}
