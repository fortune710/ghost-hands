import { Navigate, Route, Routes } from 'react-router-dom';
import { Join } from './routes/Join';
import { JoinCode } from './routes/JoinCode';
import { Live } from './routes/Live';
import { Calibrate } from './routes/Calibrate';
import { DevPointer } from './dev/DevPointer';
import { DevReceiver } from './dev/DevReceiver';

export function App() {
  return (
    <Routes>
      <Route path="/" element={<Navigate to="/join" replace />} />
      <Route path="/join" element={<Join />} />
      <Route path="/join/:code" element={<JoinCode />} />
      <Route path="/live/:code" element={<Live />} />
      <Route path="/calibrate" element={<Calibrate />} />
      <Route path="/dev/pointer" element={<DevPointer />} />
      <Route path="/dev/receiver" element={<DevReceiver />} />
      <Route path="*" element={<Navigate to="/join" replace />} />
    </Routes>
  );
}
