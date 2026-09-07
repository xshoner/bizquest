import mascotSheet from "../../images/team-mascots.png";
import { getMascot } from "../../lib/mascots.js";

export function MascotAvatar({ mascotId, size = "medium", className = "" }) {
  const mascot = getMascot(mascotId);
  const x = mascot.column * 25;
  const y = mascot.row * 100;
  return (
    <span
      className={`mascot-avatar mascot-avatar-${size} ${className}`}
      role="img"
      aria-label={`${mascot.name} 마스코트`}
      style={{ backgroundImage: `url(${mascotSheet})`, backgroundPosition: `${x}% ${y}%` }}
    />
  );
}

