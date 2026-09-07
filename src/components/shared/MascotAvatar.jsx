import mascotSheet from "../../images/team-mascots.png";
import dragonImage from "../../images/team-mascot-dragon.png";
import otterImage from "../../images/team-mascot-otter.png";
import { getMascot } from "../../lib/mascots.js";

export function MascotAvatar({ mascotId, size = "medium", className = "" }) {
  const mascot = getMascot(mascotId);
  const individualImage = { dragon: dragonImage, otter: otterImage }[mascot.id];
  const x = mascot.column * 25;
  const y = mascot.row * 100;
  return (
    <span
      className={`mascot-avatar mascot-avatar-${size} ${className}`}
      role="img"
      aria-label={`${mascot.name} 마스코트`}
      style={individualImage
        ? { backgroundImage: `url(${individualImage})`, backgroundPosition: "center", backgroundSize: "contain", backgroundRepeat: "no-repeat" }
        : { backgroundImage: `url(${mascotSheet})`, backgroundPosition: `${x}% ${y}%` }}
    />
  );
}
