/* JS for preset "Menu V2" */
(function() {
	$(function() {
		$('.menu-wrapper').each(function() {
			initMenu($(this))
		});
	});

	// Make :active pseudo classes work on iOS
	document.addEventListener("touchstart", function() {}, false);

	var initMenu = function($menuWrapper) {
		var $body = $('body');
		var $menu = $('.ed-menu', $menuWrapper);
		var $menuLinks = $('a', $menu);
		var $menuTrigger = $('.menu-trigger', $menuWrapper);
		var $banner = $('.banner').first();

		var menuWrapperHeight = $menuWrapper.outerHeight();
		var bannerHeight = $banner.length ? $banner.outerHeight() : 0;
		var smoothScrollOffset = 20;
		
		toggleClassOnClick($body.add($menu), $menuTrigger, null, 'open open-menu'); // Keep open on $menu for backward compatibility
		activateSmoothScroll($menuLinks.add($('.scroll a')), smoothScrollOffset);
		addClassOnVisibleLinkTargets($menuLinks, 'active', 2 / 3);
		handleSticky($menuWrapper, 'sticky', $banner);
	};

	/**
	 * Observe element's height changes and reload the initMenu() function
	 *
	 * @param {HTMLElement} elm Element to observe
	 * @param {function} callback to call when elmement's height changed
	 */
	var observeHeightChange = function(elm, callback) {
		if (!('ResizeObserver' in window) || elm == null) return;

		var ro = new ResizeObserver(callback);
		ro.observe(elm);
	}

	/**
	 * Toggles class on a target when a trigger is clicked
	 * 
	 * @param {jQuery} $target The target to apply the CSS class to
	 * @param {jQuery} $trigger The Trigger
	 * @param {jQuery} $closeTrigger Optional close trigger
	 * @param {string} cssClass CSS Class to toggle on the target
	 */
	var toggleClassOnClick = function($target, $trigger, $closeTrigger, cssClass) {

		// Reset in case class "open" was saved accidentally
		$target.removeClass(cssClass);
		$trigger.removeClass(cssClass);

		// Click on trigger toggles class "open"
		$trigger.off('.toggle').on('click.toggle', function() {
			$(this).toggleClass(cssClass);
			$target.toggleClass(cssClass);
		});

		// Close target when link inside is clicked
		$target.find('a').click(function() {
			$target.removeClass(cssClass);
			$trigger.removeClass(cssClass);
		});

		if (!$closeTrigger || !$closeTrigger.length) {
			return;
		}

		$closeTrigger.click(function() {
			$target.removeClass(cssClass);
			$trigger.removeClass(cssClass);
		});
	};

	/**
	 * Smooth scroll to link targets
	 * 
	 * @param {jQuery} $scrollLinks The links
	 * @param {jQuery} scrollOffset Offset to subtract from the scroll target position (e.g. for fixed positioned elements like a menu)
	 */
	var activateSmoothScroll = function($scrollLinks, scrollOffset) {
		if (typeof scrollOffset === 'undefined') {
			scrollOffset = 0;
		}

		var determineTarget = function($trigger, hash) {
			if (hash == '#!next') {
				return $trigger.closest('.ed-element').next();
			}

			return $(hash);
		}

		$scrollLinks.click(function(e) {
			var $target = determineTarget($(this), this.hash);
			if (!$target.length) return;
			e.preventDefault();

			viewport.scrollTo($target, 'top', 500, 0);

		});
	};

	/**
	 * We are using the fill property on an element to pass user's choices from CSS to JavaScript
	 * 
	 * @param {jQuery} $element
	 */
	var getStickyMode = function($element) {
		var fillValue = getComputedStyle($element[0]).fill;

		return fillValue === 'rgb(255, 0, 0)' ?
			'sticky_banner' :
			fillValue === 'rgb(0, 255, 0)' ?
			'sticky_menu' :
			fillValue === 'rgb(0, 0, 255)' ?
			'sticky_instant' :
			fillValue === 'rgb(255, 255, 255)' ?
			'sticky_reverse' :
			'sticky_none';
	};

	/**
	 * Adds a class to an element when not currently visible
	 * 
	 * @param {jQuery} $element The element to handle stickyness for
	 * @param {string} cssClass The actual CSS class to be applied to the element when it's above a certain scroll position
	 * @param {jQuery} $banner A banner to reference the scroll position to
	 */
	var handleSticky = function($element, cssClass, $banner) {
		var triggerPos = 0,
			offset = 0;
		var menuWrapperHeight = $element.outerHeight();
		var mode;
		var prevScroll = 0;
		$element.removeClass(cssClass);
		
		var toggleSpacer = function(toggle) {
			document.body.style.setProperty('--spacer-height', toggle ? menuWrapperHeight + 'px' : '');
		};

		var handleScroll = function() {
			if (!$element.length || mode === 'sticky_none') return;

			var isReverse = mode === 'sticky_reverse',
				curScroll = viewport.getScrollTop();

			if (triggerPos <= curScroll && (!isReverse || prevScroll > curScroll)) {
				$element.addClass(cssClass);
				toggleSpacer(true);
			} else {
				$element.removeClass(cssClass);
				toggleSpacer(false);
			}

			prevScroll = curScroll;
		};
		
		var updateOffset = function() {
			mode = getStickyMode($element);
			menuWrapperHeight = $element.outerHeight();
			if (!$element.hasClass(cssClass)) {
				offset = $element.offset().top;
			}
			if (mode === 'sticky_banner' && !$banner.length) {
				mode = 'sticky_menu';
			}
			if (mode === 'sticky_banner') {
				triggerPos = $banner.offset().top + ($banner.length ? $banner.outerHeight() : $element.outerHeight());
			}
			if (mode === 'sticky_menu' || mode === 'sticky_reverse') {
				triggerPos = offset + $element.outerHeight();
			}
			if (mode === 'sticky_instant') {
				triggerPos = offset;
			}
			
			handleScroll();
		}
		
		viewport.observe('resize', updateOffset);
		viewport.observe('animation.end', updateOffset);
		observeHeightChange($element[0], updateOffset);
		updateOffset();
		
		viewport.observe('scroll', handleScroll);
		handleScroll();
	};

	/**
	 * Adds a class to links whose target is currently inside the viewport
	 * 
	 * @param {jQuery} $links Link(s) to be observed
	 * @param {string} cssClass CSS Class to be applied
	 * @param {float} sectionViewportRatio Ratio by which the target should be within the viewport
	 */
	var addClassOnVisibleLinkTargets = function($links, cssClass, sectionViewportRatio) {
		if (typeof sectionViewportRatio === 'undefined') {
			sectionViewportRatio = 1 / 2;
		}

		var menuTargets = [];
		var activeLink = $links.filter('.active:not(.wv-link-elm)').eq(0);

		var links = $links.filter(function() {
			var $target = $(this.hash);
			if (!$target.length) {
				return false;
			}

			// Cache offset position to improve performance (update on resize)		
			var updateOffset = function() {
				$target.data('offset', $target.offset().top);
			};

			viewport.observe('resize', updateOffset);
			viewport.observe('animation.end', updateOffset);
			updateOffset();

			menuTargets.push($target);
			return true;
		});

		// No hash links found, so don't handle it at all
		if (!links.length) {
			return;
		}

		var checkVisibility = function() {
			$links.removeClass('active');

			// Check section position reversely
			for (var i = menuTargets.length - 1; i >= 0; i--) {
				var desiredScrollPosition = menuTargets[i].data('offset') - viewport.getHeight() * (1 - sectionViewportRatio);
				if (viewport.getScrollTop() >= desiredScrollPosition && menuTargets[i][0].offsetParent !== null) {
					links.eq(i).addClass(cssClass);
					return;
				}
			}

			// Fallback to originally active item
			activeLink.addClass(cssClass);
		};

		viewport.observe('scroll', checkVisibility);
		checkVisibility();
	};
})();
/* End JS for preset "Menu V2" */

/* JS for preset "Phonic" */
$(function() {
	if (!$('body').is('.edit')) {
		$('.horizontal-form').each(function() {
			$(this).click(function() {
				$('.ed-form-captcha', this).addClass('show');
			});
		});
	}
}); 
/* End JS for preset "Phonic" */

/* JS for preset "Back to top button V3" */
(function() {
    var initBackToTop = function() {
        var $button = $('.back-to-top-button-icon');
        
    	clickToTop($button);
    	
    	// Show back to top only below the fold
    	viewport.observe('scroll', function() {
    		if (viewport.getScrollTop() > (viewport.getHeight() / 3)) {
    			$button.addClass('show');
    		} else {
    			$button.removeClass('show');
    		}
    	});
    };
    
    var clickToTop = function($trigger) {
    	$trigger.removeClass('show');
    
    	$trigger.click(function(e) {
    		e.preventDefault();
    		viewport.scrollTo(0, 'top', 500, 0);
    	});
    };
    
    $(initBackToTop);
})();
/* End JS for preset "Back to top button V3" */

/* JS for preset "Form CSRF bridge" */
(function() {
	var csrfToken = null;
	var csrfPromise = null;

	var getApiBase = function() {
		if (typeof window !== 'undefined' && window.location && window.location.origin && window.location.origin !== 'null') {
			return window.location.origin + '/api.php';
		}

		if (typeof webcard !== 'undefined' && webcard && webcard.apiHost) {
			var protocol = (typeof window !== 'undefined' && window.location && window.location.protocol && window.location.protocol !== 'file:')
				? window.location.protocol
				: 'https:';

			return protocol + '//' + webcard.apiHost + '/api.php';
		}

		return '/api.php';
	};

	var shouldPrefetchCsrf = function() {
		if (typeof window === 'undefined' || !window.location) {
			return true;
		}

		if (window.location.protocol === 'file:') {
			return false;
		}

		var host = (window.location.hostname || '').toLowerCase();
		if (host === 'localhost' || host === '127.0.0.1') {
			return false;
		}

		return true;
	};

	var ensureCsrfToken = function() {
		if (csrfToken) {
			return $.Deferred().resolve(csrfToken).promise();
		}

		if (csrfPromise) {
			return csrfPromise;
		}

		csrfPromise = $.ajax({
			url: getApiBase() + '/form_container/csrf',
			crossDomain: true,
			xhrFields: {
				withCredentials: true
			},
			type: 'GET',
			dataType: 'json'
		}).then(function(result) {
			csrfToken = result && result.token ? result.token : null;
			return csrfToken;
		}).fail(function() {
			csrfToken = null;
		});

		return csrfPromise;
	};

	var injectTokenField = function($form, token) {
		if (!$form || !$form.length || !token) {
			return;
		}

		var $tokenField = $form.find('input[name="csrf_token"]');
		if (!$tokenField.length) {
			$tokenField = $('<input type="hidden" name="csrf_token" />');
			$form.append($tokenField);
		}

		$tokenField.val(token);
	};

	var patchFormContainer = function() {
		if (!window.ElementFormContainer || !window.ElementFormContainer.prototype) {
			return;
		}

		if (window.ElementFormContainer.prototype.__csrfPatched) {
			return;
		}

		var originalSubmit = window.ElementFormContainer.prototype.submit;

		window.ElementFormContainer.prototype.submit = function() {
			var self = this;

			if (self.__csrfPreparing || (typeof cms !== 'undefined' && cms)) {
				return originalSubmit.apply(self, arguments);
			}

			self.__csrfPreparing = true;
			ensureCsrfToken().always(function() {
				if (csrfToken) {
					injectTokenField(self.$form, csrfToken);
				}

				self.__csrfPreparing = false;
				originalSubmit.call(self);
			});

			return self;
		};

		window.ElementFormContainer.prototype.__csrfPatched = true;
	};

	$(function() {
		if (shouldPrefetchCsrf()) {
			ensureCsrfToken();
		}

		patchFormContainer();
	});
})();
/* End JS for preset "Form CSRF bridge" */

/* JS for preset "Image Lazy Loading with IntersectionObserver" */
(function() {
	var hasIntersectionObserver = typeof window !== 'undefined' && 'IntersectionObserver' in window;

	var setImageSource = function($img) {
		if (!$img || !$img.length) {
			return;
		}

		var dataSrc = $img.attr('data-src');
		var dataSrcset = $img.attr('data-srcset');

		if (dataSrc) {
			$img.attr('src', dataSrc);
			$img.removeAttr('data-src');
		}

		if (dataSrcset) {
			$img.attr('srcset', dataSrcset);
			$img.removeAttr('data-srcset');
		}

		if (!$img.attr('loading')) {
			$img.attr('loading', 'lazy');
		}

		if (!$img.attr('decoding')) {
			$img.attr('decoding', 'async');
		}

		$img.removeClass('ed-lazyload');
	};

	var setPictureSources = function($picture) {
		if (!$picture || !$picture.length) {
			return;
		}

		$picture.find('source').each(function() {
			var $source = $(this);
			var dataSrcset = $source.attr('data-srcset');

			if (dataSrcset) {
				$source.attr('srcset', dataSrcset);
				$source.removeAttr('data-srcset');
			}
		});
	};

	var setBackgroundImage = function($holder) {
		if (!$holder || !$holder.length) {
			return;
		}

		var background = $holder.attr('data-background');
		if (!background) {
			return;
		}

		$holder.css('background-image', background);
		$holder.removeAttr('data-background');
		$holder.removeClass('ed-lazyload');
	};

	var revealNode = function(node) {
		var $node = $(node);

		if ($node.is('img')) {
			setImageSource($node);
			setPictureSources($node.closest('picture'));
		}

		if ($node.is('picture')) {
			setPictureSources($node);
			setImageSource($node.find('img').first());
		}

		if ($node.is('.background-image-holder')) {
			setBackgroundImage($node);
		}

		$node.attr('data-io-ready', '1');
	};

	var observeTargets = function() {
		var selector = 'img[data-src], img[data-srcset], img[loading="lazy"], picture source[data-srcset], .background-image-holder[data-background]';
		var nodes = $(selector).toArray();

		if (!nodes.length) {
			return;
		}

		if (!hasIntersectionObserver) {
			for (var i = 0; i < nodes.length; i++) {
				revealNode(nodes[i]);
			}
			return;
		}

		var observer = new IntersectionObserver(function(entries, io) {
			for (var index = 0; index < entries.length; index++) {
				var entry = entries[index];
				if (!entry.isIntersecting) {
					continue;
				}

				revealNode(entry.target);
				io.unobserve(entry.target);
			}
		}, {
			rootMargin: '250px 0px',
			threshold: 0.01
		});

		for (var i = 0; i < nodes.length; i++) {
			if (nodes[i].getAttribute('data-io-ready') === '1') {
				continue;
			}
			observer.observe(nodes[i]);
		}
	};

	$(function() {
		observeTargets();

		if (!('MutationObserver' in window)) {
			return;
		}

		var mo = new MutationObserver(function(mutations) {
			for (var i = 0; i < mutations.length; i++) {
				if (mutations[i].addedNodes && mutations[i].addedNodes.length) {
					observeTargets();
					return;
				}
			}
		});

		mo.observe(document.body, {
			childList: true,
			subtree: true
		});
	});
})();
/* End JS for preset "Image Lazy Loading with IntersectionObserver" */