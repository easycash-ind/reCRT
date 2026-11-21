import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { Login } from "./components/Login";
import { LoginPlaygroundPage } from "./pages/LoginPlaygroundPage";
import { LoginSceneOnlyPage } from "./pages/LoginSceneOnlyPage";

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Login />} />
        <Route path="/playground" element={<LoginPlaygroundPage />} />
        <Route path="/scene" element={<LoginSceneOnlyPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}