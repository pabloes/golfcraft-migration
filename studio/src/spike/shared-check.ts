/**
 * Phase 0 spike (remove in phase 1): proves the code shared with the
 * Decentraland client and the server bundles and runs inside the Studio.
 */
import { getGameWindowStatus } from '../../../common/game-window';
import { getLevelInfo } from '../../../common/utils';
import democourse from '../../../common/course-definitions/democourse';
import { createPhysicBall } from '../../../scene/golfplay/physics/ball';
import { loadCoursePhysics } from '../../../scene/golfplay/physics/course-element-loader';
import { createPhysicsWorld, initializeMaterials } from '../../../scene/golfplay/physics/world';
import { createGameHandler } from '../../../scene/golfplay/src/gameplay-handlers/gameplay-handler';
import MESSAGE from '../../../server/rooms/mesages';

export function runSharedCheck(): string {
  const level = getLevelInfo(354873) as { currentLevel: number; progressPercentage: number };
  const gameWindow = getGameWindowStatus({ fromDay: 1, toDay: 7 });

  // Same calls as the Decentraland client: materials, world, course trimeshes, ball.
  initializeMaterials();
  const { world } = createPhysicsWorld();
  loadCoursePhysics(world, { courseDefinition: democourse });
  const ball = createPhysicBall(world, { position: [0, 3, 0] });
  for (let i = 0; i < 120; i++) world.step(1 / 60);
  const y = (ball.body.position.y as number).toFixed(2);

  return [
    `level(354873 xp)=${level.currentLevel}`,
    `window(1-7).open=${gameWindow.windowOpen}`,
    `MESSAGE.START=${MESSAGE.START}`,
    `cannon ball y after 2s=${y}`,
    `bodies=${world.bodies.length}`,
    `gameHandler=${typeof createGameHandler}`,
  ].join(' | ');
}
