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
        .type(" My target is ", { delay: 350 })
        .move(null, { to: "END" })
        .type("to become a software developr")
        .move(-1, { delay: 150 })
        .type("e")
        .move(null, { to: "END" })
        .type('.', {
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

// span href link clicker

const links = document.querySelectorAll(".myLink");

  
  links.forEach(link => {
    link.onclick = function() {
        window.open(link.getAttribute('data-url'), '_blank'); //link is in html because i use multiple links on the 4 spans
    };
  });


