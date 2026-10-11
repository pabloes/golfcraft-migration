// "Play ranked with friends" — the 4-round driver, mirroring season-demo.ts.
//
// Differences from the solo run, all of them consequences of the room being
// shared (see server/rooms/season-party-room.ts):
//   - the room is joined BY ID with the one-time token the party lobby handed
//     out, instead of joinOrCreate;
//   - there is no "waiting for players" screen before round 0: the party lobby
//     already did the waiting, so the course loads behind the fade and the
//     server holds the start until everybody sent READY;
//   - the gameplay client also draws the other members' balls (room.state.players);
//   - the final COMPLETED carries `eligible`, false when the player was above
//     the room's level and therefore earned no season points.
import { GolfplayClientSeasonFactory } from '../../src/components/lobby/golfplay-client-season'
import { getUserData } from '~system/UserIdentity'
import MESSAGE from '../../../server/rooms/mesages'
import { engine, executeTask } from '@dcl/sdk/ecs'
import { fadeInOverlay, fadeOutOverlay } from '../../src/components/ui/overlay'
import { hideWaitPlayers } from '../../src/components/lobby/season-game-countdown'
import { createOrShowNextGameUi } from '../../src/components/lobby/season-next-game-ui'

export const createSeasonPartyDemo = async (
  parent: any,
  { colyseus, wip = true, onStarting, onFinish, onStarted, userDataState }: any
) => {
  const callbacks = { onStarting, onFinish, onStarted }
  const { createClientGolfPlay } = GolfplayClientSeasonFactory({
    golfplayBaseUrl: (engine as any)['__COURSE_MODELS_BASE__']
  })
  const userData: any = await getUserData({}).then((r: any) => r.data)
  let starting = false

  return { startGame }

  async function startGame({ roomId, token }: { roomId: string; token: string }) {
    if (starting) return
    const state = { currentGame: 0 }
    starting = true
    hideWaitPlayers()
    await fadeInOverlay(0.5)

    let golfplay: any
    // Hoisted above every closure that reads it (CLAUDE.md §6 #7).
    let room: any
    callbacks.onStarting && callbacks.onStarting()
    try {
      room = await colyseus.joinById(roomId, {
        user: { ...userData, avatar: undefined },
        userId: userData.userId,
        token
      })
      starting = false
      callbacks.onStarted && callbacks.onStarted()

      room.onMessage(MESSAGE.GAME_DEFINITIONS, async ({ gameDefinitions, ghostsData, playerIndex }: any) => {
        console.log('[season-party] GAME_DEFINITIONS', playerIndex, gameDefinitions)
        handleGolfplay()

        async function handleGolfplay({ rewards, tierSub, newTierSub, rewardsBonus, eligible }: any = {}) {
          if (state.currentGame) {
            executeTask(async () => {
              await createOrShowNextGameUi(
                userData,
                state.currentGame,
                room.state.results.toJSON(),
                tierSub,
                newTierSub,
                undefined,
                state.currentGame === 4 ? 10000 : 5000,
                rewards,
                rewardsBonus,
                state.currentGame === 4 && eligible === false
                  ? 'You played below your own rank, so this run gives no season points.'
                  : undefined,
                // The members' rows are humans; the rest are ghosts.
                room.state.players.map((p: any) => p.address)
              )
              fadeOutOverlay(1)
              if (state.currentGame < 4) {
                await createGame(state.currentGame)
                golfplay.ready()
              } else {
                callbacks.onFinish && callbacks.onFinish()
                room.leave()
              }
            })
          } else {
            executeTask(async () => {
              try {
                // No pre-round wait screen here: load the course behind the
                // black overlay, tell the server we are READY and only then
                // reveal it. The server starts the round once everybody is in.
                await createGame(state.currentGame)
                golfplay.ready()
                await fadeOutOverlay(1)
              } catch (error) {
                console.log('[season-party] first round error', error)
              }
            })
          }

          async function createGame(currentGame: number) {
            console.log('[season-party] createGame', currentGame)
            const golfclubs = userDataState.golfclubs
            const activeGolfClub =
              (golfclubs &&
                (golfclubs.find((item: any) => item.CustomData?.tokenId === userDataState.activeGolfClubTokenId) ||
                  golfclubs.find((item: any) => item.ItemId === 'golfclub-1'))) || { ItemId: '1' }

            if (state.currentGame < 4) {
              golfplay = await createClientGolfPlay(parent, {
                gameDefinition: gameDefinitions[state.currentGame],
                room,
                wip,
                golfclub: {
                  id: activeGolfClub.ItemId.replace('golfclub-', ''),
                  power: Number(activeGolfClub.CustomData?.attribute_power || 0),
                  control: Number(activeGolfClub.CustomData?.attribute_control || 0),
                  aim: Number(activeGolfClub.CustomData?.attribute_aim || 0)
                },
                currentGame: state.currentGame,
                currentUserName: userData.displayName,
                ghostsData,
                colyseus,
                partyPlayers: room.state.players,
                partyPlayerIndex: playerIndex
              })

              golfplay.onFinish((data: any) => {
                console.log('[season-party] FINISHED', data)
              })

              golfplay.onComplete(async (result: any) => {
                console.log('[season-party] COMPLETED', state.currentGame, result?.rewards)
                state.currentGame++
                golfplay.dispose()
                if (state.currentGame <= 4) {
                  handleGolfplay(result)
                } else {
                  state.currentGame = 0
                }
              })
            }
          }
        }
      })
    } catch (error) {
      // A rejected join (stale token, party already started without us) must not
      // leave the player staring at a black screen.
      console.log('[season-party] startGame error', error)
      starting = false
      await fadeOutOverlay(1)
      callbacks.onFinish && callbacks.onFinish()
    }
  }
}
