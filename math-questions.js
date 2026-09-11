const PLAY_CALLS = {
  5: {name:'Quick Slant', difficulty:'Rookie', xp:5, yards:5},
  10: {name:'Curl Route', difficulty:'Starter', xp:10, yards:10},
  15: {name:'Deep Cross', difficulty:'Captain', xp:15, yards:15},
  20: {name:'End Zone Shot', difficulty:'All-Pro', xp:20, yards:20}
};
const LEVEL_THRESHOLDS = [0, 500, 1500, 3500, 7500];

function createQuestion(yards = 10, totalXp = 0, random = Math.random, difficultyBoost = 0) {
  const play = PLAY_CALLS[Number(yards)] || PLAY_CALLS[10];
  const level = Math.max(0, LEVEL_THRESHOLDS.filter(xp => Number(totalXp) >= xp).length - 1) + Math.max(0, Math.min(3, Number(difficultyBoost) || 0));
  const int = (min, max) => min + Math.floor(random() * (max - min + 1));
  const variant = int(0, 3);
  const result = (question, answer, explanation) => ({
    question, answer, explanation, playName:play.name,
    difficulty:play.difficulty, xp:play.xp, yards:play.yards
  });

  if (play.yards === 5) {
    const a = int(125, 275) + level * 125, b = int(48, 96) + level * 25;
    const c = int(27, 69) + level * 15;
    if (variant === 0) return result(
      `The equipment room has ${a} practice cones. The coach buys ${b} more, then sends ${c} to another field. How many cones remain?`,
      a+b-c, `${a} + ${b} = ${a+b}. Then ${a+b} - ${c} = ${a+b-c} cones.`);
    if (variant === 1) return result(
      `A team wants ${a+b+c} rushing yards across three games. It gains ${a} in the first game and ${b} in the second. How many yards must it gain in the third game to reach its goal?`,
      c, `${a} + ${b} = ${a+b}. The remaining goal is ${a+b+c} - ${a+b} = ${c} yards.`);
    if (variant === 2) return result(
      `A stadium shop starts with ${a+b} pennants. It sells ${a} before kickoff and receives ${c} more at halftime. How many pennants does it have now?`,
      b+c, `${a+b} - ${a} = ${b}. Then ${b} + ${c} = ${b+c} pennants.`);
    return result(
      `One team gains ${a} passing yards and ${b} rushing yards. Its opponent gains ${a-c} total yards. How many more total yards does the first team gain?`,
      b+c, `${a} + ${b} = ${a+b} total yards. ${a+b} - ${a-c} = ${b+c} more yards.`);
  }

  if (play.yards === 10) {
    const groups = int(4, 8), each = int(16, 29) + level * 12, extra = int(9, 15) + level * 3;
    if (variant === 0) return result(
      `The stadium has ${groups} snack stands. Each starts with ${each} sandwiches. Altogether, the stands sell ${extra} sandwiches. How many sandwiches remain?`,
      groups*each-extra, `${groups} x ${each} = ${groups*each}. Subtract ${extra}: ${groups*each-extra} sandwiches remain.`);
    if (variant === 1) return result(
      `A coach divides ${groups*each} practice cards equally among ${groups} groups. Each group then gets ${extra} bonus cards. How many cards does each group have?`,
      each+extra, `${groups*each} / ${groups} = ${each}. Then ${each} + ${extra} = ${each+extra} cards per group.`);
    if (variant === 2) return result(
      `A fan buys ${groups} tickets at $${each} each and pays $${extra} total for parking. What is the total cost in dollars?`,
      groups*each+extra, `${groups} x $${each} = $${groups*each}. Add $${extra} for a total of $${groups*each+extra}.`);
    return result(
      `There are ${groups*each+extra} water bottles. The coach sets aside ${extra}, then divides the rest equally among ${groups} groups. How many bottles does each group receive?`,
      each, `${groups*each+extra} - ${extra} = ${groups*each}. Divide by ${groups}: ${each} bottles each.`);
  }

  if (play.yards === 15) {
    const groups = int(4, 8), each = int(18, 32) + level * 9, used = int(5, 12) + level * 2;
    if (variant === 0) return result(
      `A coach has ${groups} boxes of ${each} wristbands. After giving out ${groups*used} wristbands, the coach divides the rest equally among ${groups} teams. How many wristbands does each team get?`,
      each-used, `${groups} x ${each} = ${groups*each}. Subtract ${groups*used} to get ${groups*(each-used)}. Divide by ${groups}: ${each-used} wristbands per team.`);
    if (variant === 1) {
      const denominator = int(3, 6), total = denominator * each, donated = used;
      return result(
        `A shop has ${total} team hats. It sells 1/${denominator} of them, then donates ${donated} of the remaining hats. How many hats are left?`,
        total-each-donated, `1/${denominator} of ${total} is ${total} / ${denominator} = ${each}. ${total} - ${each} - ${donated} = ${total-each-donated} hats.`);
    }
    if (variant === 2) {
      const length = int(3, 8) + level, trim = int(7, 11);
      return result(
        `A banner is ${length} feet long. A designer trims ${trim} inches off each end. How many inches long is the banner now? (1 foot = 12 inches.)`,
        length*12-trim*2, `${length} x 12 = ${length*12} inches. Both ends: ${trim} x 2 = ${trim*2}. ${length*12} - ${trim*2} = ${length*12-trim*2} inches.`);
    }
    const warmup = int(18, 27), drills = int(10, 14) + level * 2, breakTime = int(5, 9);
    return result(
      `Practice starts at 3:15 p.m. and ends at 5:00 p.m. There is a ${warmup}-minute warmup, three ${drills}-minute drills, and one ${breakTime}-minute break. How many minutes remain for a scrimmage?`,
      105-warmup-3*drills-breakTime, `3:15 to 5:00 is 105 minutes. Drills take 3 x ${drills} = ${3*drills} minutes. 105 - ${warmup} - ${3*drills} - ${breakTime} = ${105-warmup-3*drills-breakTime} minutes.`);
  }

  const count = int(4, 8), each = int(24, 36) + level * 8, extra = int(11, 19);
  if (variant === 0) {
    const seats = int(20, 30), people = count*each+extra, buses = Math.ceil(people/seats);
    return result(
      `${count} classes with ${each} students each and ${extra} adults are going to a stadium. Each bus has ${seats} passenger seats. What is the fewest number of buses needed so every student and adult has a seat?`,
      buses, `${count} x ${each} + ${extra} = ${people} people. ${buses-1} buses hold ${(buses-1)*seats}, which is too few; ${buses} hold ${buses*seats}. You need ${buses} buses.`);
  }
  if (variant === 1) {
    const denominator = int(3, 6), numerator = denominator-1, total = denominator*each;
    return result(
      `A shop starts with ${total} team scarves. It sells ${numerator}/${denominator} of them, then receives ${count} boxes containing ${extra} new scarves each. How many scarves does it have now?`,
      each+count*extra, `${total} / ${denominator} x ${numerator} = ${each*numerator} sold. ${total} - ${each*numerator} = ${each} left. Add ${count} x ${extra} = ${count*extra}: ${each+count*extra} scarves.`);
  }
  if (variant === 2) {
    const price = int(6, 9), remaining = int(20, 35) + level * 5, budget = count*each+extra+remaining;
    return result(
      `A fan club has $${budget}. It buys ${count} tickets for $${each} each and pays $${extra} total for parking. Souvenir programs cost $${price} each. What is the greatest number of programs it can buy with the money left?`,
      Math.floor(remaining/price), `Tickets cost ${count} x $${each} = $${count*each}. $${budget} - $${count*each} - $${extra} = $${remaining}. $${remaining} buys ${Math.floor(remaining/price)} whole programs at $${price} each.`);
  }
  const teams = int(3, 6), perTeam = int(15, 25) + level * 6;
  const needed = teams*perTeam-extra, boxes = Math.ceil(needed/each);
  return result(
    `There are ${teams} teams that each need ${perTeam} wristbands. The coach already has ${extra} wristbands. New wristbands come only in boxes of ${each}. What is the fewest number of boxes the coach must buy to supply all teams?`,
    boxes, `Teams need ${teams} x ${perTeam} = ${teams*perTeam}. Subtract ${extra} already owned: ${needed} needed. ${boxes-1} boxes supply ${(boxes-1)*each}, too few. ${boxes} boxes supply ${boxes*each}, so buy ${boxes} boxes.`);
}

module.exports = { createQuestion, LEVEL_THRESHOLDS };
