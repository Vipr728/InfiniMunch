const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

function init() {
	ctx.fillStyle = 'green';
	ctx.fillRect(0, 0, canvas.width, canvas.height);
}

function gameLoop() {
	ctx.clearRect(0, 0, canvas.width, canvas.height);
	ctx.fillStyle = 'red';
	ctx.fillRect(50, 50, 100, 100);
	requestAnimationFrame(gameLoop);
}

init();
gameLoop();
