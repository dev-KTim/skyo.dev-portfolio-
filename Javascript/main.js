function scrollToAnchor(anchorID, offset) {
    var target = document.querySelector(anchorID);
    if (target) {
        var targetPosition = target.getBoundingClientRect().top + window.pageYOffset;
        window.scrollTo({
            top: targetPosition - offset,
            behavior: "smooth"
        });
    }
}
document.querySelectorAll('a[href^="#about"]'). //about section
forEach(anchor => {
    anchor.addEventListener('click', function (e) {
        e.preventDefault();
        var href = this.getAttribute('href');
        scrollToAnchor(href, -230); //offset for anchor
    });
});

document.querySelectorAll('a[href^="#me"]'). //me section
forEach(anchor => {
    anchor.addEventListener('click', function (e) {
        e.preventDefault();
        var href = this.getAttribute('href');
        scrollToAnchor(href, 80); //offset for anchor
    });
});

document.querySelectorAll('a[href^="#progression"]'). //progression section
forEach(anchor => {
    anchor.addEventListener('click', function (e) {
        e.preventDefault();
        var href = this.getAttribute('href');
        scrollToAnchor(href, -60); //offset for anchor
    });
});

document.querySelectorAll('a[href^="#contact"]'). //contact section
forEach(anchor => {
    anchor.addEventListener('click', function (e) {
        e.preventDefault();
        var href = this.getAttribute('href');
        scrollToAnchor(href, -230); //offset for anchor
    });
});


      // Window 3D-Effect
       window.addEventListener("mousemove", e => {
      const ticketElm = document.getElementById("ticket")
       const { x, y, width, height } = ticketElm.getBoundingClientRect()
       console.log(ticketElm.getBoundingClientRect())
       const centerPoint = { x: x + width / 2, y: y + height / 2 }
       window.addEventListener("mousemove", e => {
         const degreeX = (e.clientY - centerPoint.y) * 0.025
         const degreeY = (e.clientX - centerPoint.x) * -0.025


         ticketElm.style.transform = `perspective(1000px) rotateX(${degreeX}deg) rotateY(${degreeY}deg)`;
       })
     })

      // SidebarActiveJS
      let btn = document.querySelector('#btn')
      let sidebar = document.querySelector('.sidebar')

      btn.onclick = function () {
          sidebar.classList.toggle('active');
      };

      //Type AnimationJS
      new TypeIt("#type-animation", {
        speed: 50,
        startDelay: 900,
      })
        .type("hey, ITim. ", { delay: 100 })
        .move(-5, { delay: 70 })
        .type("'m ", { delay: 200 }) 
        .move(null, { to: "START", instant: true, delay: 300 })
        .move(1, { delay: 110 })
        .delete(1)
        .type("H", { delay: 170 })
        .pause(200)
        .move(2, { instant: true })
        .pause(200)
        .move(5, { instant: true })
        .move(6, { delay: 200 })
        .type(" My dream is ", { delay: 350 })
        .move(null, { to: "END" })
        .type("to become a web or software developr ")
        .move(-2, { delay: 150 })
        .type("e")
        .move(null, { to: "END" })
        .type('<span class="place">in games.</span>', { delay: 400 })
        .delete(".place", { delay: 800, instant: true })
        .type('in your company ^^.', {
          speed: 75,
        })
        .go();


        window.onload = function() {
    animateSequence();
    animateRandom();
};

function animateSequence() {
    var a = document.getElementsByClassName('sequence');
    for (var i = 0; i < a.length; i++) {
        var $this = a[i];
        var letter = $this.innerHTML;
        letter = letter.trim();
        var str = '';
        var delay = 100;
        for (l = 0; l < letter.length; l++) {
            if (letter[l] != ' ') {
                str += '<span style="animation-delay:' + delay + 'ms; -moz-animation-delay:' + delay + 'ms; -webkit-animation-delay:' + delay + 'ms; ">' + letter[l] + '</span>';
                delay += 150;
            } else
                str += letter[l];
        }
        $this.innerHTML = str;
    }
}