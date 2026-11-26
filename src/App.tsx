import { lazy, Suspense } from "react";
import { HashRouter, Navigate, Route, Routes } from "react-router-dom";
import { useProgress } from "./state/store";
import { LessonQuiz, ReviewQuiz, SkipQuiz } from "./ui/quiz/QuizScreen";
import { LessonScreen } from "./ui/screens/LessonScreen";
import { MapScreen } from "./ui/screens/MapScreen";
import { Onboarding } from "./ui/screens/Onboarding";
import { ProfileScreen } from "./ui/screens/ProfileScreen";
import { ReviewScreen } from "./ui/screens/ReviewScreen";

// Labs carry the editor (CodeMirror): loaded only when a lab opens.
const LabScreen = lazy(() => import("./ui/lab/LabScreen").then((m) => ({ default: m.LabScreen })));

function Home() {
  const p = useProgress();
  return <Navigate to={p.onboarded ? "/mapa" : "/registro"} replace />;
}

// Hash routes work on any static host (GitHub Pages included) without server rewrites.
export function App() {
  return (
    <HashRouter>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/registro" element={<Onboarding />} />
        <Route path="/mapa" element={<MapScreen />} />
        <Route path="/leccion/:unit/:lesson" element={<LessonScreen />} />
        <Route path="/prueba/:unit/:lesson/:test" element={<LessonQuiz />} />
        <Route path="/saltar/:unit" element={<SkipQuiz />} />
        <Route
          path="/lab/:unit/:lesson/:lab"
          element={
            <Suspense fallback={<p className="page muted mono">cargando lab…</p>}>
              <LabScreen />
            </Suspense>
          }
        />
        <Route path="/repaso" element={<ReviewScreen />} />
        <Route path="/repaso/jugar" element={<ReviewQuiz />} />
        <Route path="/perfil" element={<ProfileScreen />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </HashRouter>
  );
}
