// Absolute-time smoke test: no timers, random state or previous-frame dependence.
export function draw(ctx,t,{W,H,dur}) {
  ctx.fillStyle='#13271f';ctx.fillRect(0,0,W,H);
  const u=Math.min(1,Math.max(0,t/dur)),e=1-Math.pow(1-u,3);
  ctx.fillStyle='#ccebd7';ctx.fillRect(W*.15+W*.55*e,H*.38,W*.12,W*.12);
  ctx.fillStyle='white';ctx.textAlign='center';ctx.font=`bold ${W*.065}px sans-serif`;
  ctx.fillText('Render pipeline ready',W*.5,H*.6);
  ctx.font=`${W*.035}px monospace`;ctx.fillText(t.toFixed(3)+' s',W*.5,H*.66);
}
