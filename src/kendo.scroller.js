(function($, window, undefined) {
    var kendo = window.kendo;

    function Scroller (element) {
        this.element = $(element);

        this.options = {
            acceleration: 10,
            velocity: .5,
            pagingVelocity: 5,
            friction: .95,
            bounceAcceleration: .1,
            bounceDeceleration: .1,
            bounceLimit: 0,
            bounceStop: 100,
            framerate: 30,

            scrollbarOpacity: .7
        };

        if (typeof arguments[1] === 'object')
            $.extend( this.options, arguments[1] );

        this.xScrollbar = $('<div class="touch-scrollbar horizontal-scrollbar" />');
        this.yScrollbar = this.xScrollbar.clone().removeClass('horizontal-scrollbar').addClass('vertical-scrollbar');
        this._scrollbars = $().add(this.xScrollbar).add(this.yScrollbar);
        this.webkit3d = 'WebKitCSSMatrix' in window && 'm11' in new WebKitCSSMatrix();

        this._startProxy = $.proxy(this._start, this);
        this._stopProxy = $.proxy(this._stop, this);
        this._dragProxy = $.proxy(this._drag, this);
        this._gestureStartProxy = $.proxy(this._onGestureStart, this);
        this._gestureEndProxy = $.proxy(this._onGestureEnd, this);
        this._stepScrollProxy = $.proxy( this._stepScrollAnimation, this );
        this._stepKinetikProxy = $.proxy( this._stepKinetikAnimation, this );

        this._transformProperty = kendo.support.transitions.css + 'transform';
        this._transformOrigin = kendo.support.transitions.css + 'transform-origin';
        this._translate3DPrefix = 'translate' + (this.webkit3d ? '3d(' : '(');
        this._translate3DSuffix = (this.webkit3d ? ', 0)' : ')');

        this._create();
    }

    function touchLocation(e) {
        var changedTouches = e.changedTouches ? e.changedTouches : null;

        if (changedTouches) {
            return {
                idx: changedTouches[0].identifier,
                x: changedTouches[0].pageX,
                y: changedTouches[0].pageY
            };
        }

        return {
            idx: 0,
            x: e.pageX,
            y: e.pageY
        };
    }

    $.throttle = function(delay, callback) {
        var timeout_id,
            last_call = 0,
            omit_ending = arguments[2] || false;

        return function () {
            var that = this,
                time_span = +new Date() - last_call,
                args = arguments;

            function execute() {
                last_call = +new Date();
                callback.apply(that, args);
            }

            function clear() {
                timeout_id = undefined;
            }

            timeout_id && clearTimeout(timeout_id);

            if (time_span > delay)
                execute();
            else
                if (!omit_ending)
                    timeout_id = setTimeout( execute, delay - time_span);
        };
    };

    Scroller.prototype = {
        _create: function () {
            if (kendo.support.touch) {
                this._moveEvent = "touchmove",
                this._startEvent = "touchstart",
                this._endEvent = "touchend";
            } else {
                this._moveEvent = "mousemove",
                this._startEvent = "mousedown",
                this._endEvent = "mouseup";
            }
            var scrollElement = '<div class="scroll-container"></div>';
            var children = this.element.children();

            this.element
                .css("overflow", "hidden")
                .bind(this._startEvent, $.proxy(this._wait, this));

            if (kendo.support.touch)
                this.element
                    .bind('gesturestart', this._gestureStartProxy )
                    .bind('gestureend', this._gestureEndProxy );

            if (children.length)
                children.wrapAll(scrollElement);
            else
                this.element.append(scrollElement);

            this.scrollElement = this.element.children();
            this._scrollbars.appendTo(this.element);

            this._storeLastLocation = $.throttle(20, function(location) {

                var dX = this.lastLocation.x - location.x, dY = this.lastLocation.y - location.y,
                    newDirection = { x: dX/Math.abs(dX) || 0, y: dY/Math.abs(dY) || 0 },
                    oldDirection = this.direction;

                if (oldDirection) {
                    if (newDirection.x && oldDirection.x != newDirection.x) {
                        this.direction.x = newDirection.x;
                        this.directionChange = +new Date();
                        this.lastLocation = location;
                    }
                    if (newDirection.y && oldDirection.y != newDirection.y) {
                        this.direction.y = newDirection.y;
                        this.directionChange = +new Date();
                        this.lastLocation = location;
                    }
                } else {
                    this.direction = newDirection;
                    this.directionChange = +new Date();
                    this.lastLocation = location;
                }

            });

            this._throttleCSS = function ( location ) {
                var position = { x: 0, y: 0 },
                    offset = 0,
                    delta = 0,
                    cssModel = {};

                if (this.hasHorizontalScroll) {
                    position.x = -this._limitValue( this.start.x - location.x, this.minBounceStop.x, this.maxBounceStop.x );
                    delta = this._getReverseDelta(-position.x, this.minBounceLimit.x, this.maxBounceLimit.x);
                    var width = ~~(this.boxWidth * this.xRatio - Math.abs(delta));
                    offset = this._limitValue( -position.x * this.xRatio - Math.abs(delta), 0, this.boxWidth);

                    cssModel[this._transformProperty] = this._translate3DPrefix + offset + 'px, 0' + this._translate3DSuffix;
                    cssModel['width'] = width + 'px';

                    this.xScrollbar.css( cssModel );
                }

                if (this.hasVerticalScroll) {
                    position.y = -this._limitValue( this.start.y - location.y, this.minBounceStop.y, this.maxBounceStop.y );
                    delta = this._getReverseDelta(-position.y, this.minBounceLimit.y, this.maxBounceLimit.y);
                    var height = ~~(this.boxHeight * this.yRatio - Math.abs(delta));
                    offset = this._limitValue( -position.y * this.yRatio - Math.abs(delta), 0, this.boxHeight );

                    cssModel = {};
                    cssModel[this._transformProperty] = this._translate3DPrefix + '0, ' + offset + 'px' + this._translate3DSuffix;
                    cssModel['height'] = height + 'px';

                    this.yScrollbar.css( cssModel );
                }

                this.scrollElement.stop(true,true).css( this._transformProperty, this._translate3DPrefix +
                                                        position.x + 'px,' + position.y + 'px' + this._translate3DSuffix);
            };

        },

        _onGestureStart: function () {
            this._dragCanceled = true;
        },

        _onGestureEnd: function () {
            this._dragCanceled = false;
        },

        _getReverseDelta: function (position, minBounceLimit, maxBounceLimit) {
            var bounceStop = this.options.bounceStop;
            return this._limitValue( (position > maxBounceLimit ? (position - maxBounceLimit) : 0) || (position < minBounceLimit ? position : 0),
                                      -bounceStop, bounceStop );
        },

        _limitValue: function (value, minLimit, maxLimit) {
            return Math.max( minLimit, Math.min( maxLimit, value));
        },

        _getScrollOffsets: function () {
            var transforms = (this.scrollElement.css(this._transformProperty).match(/(translate[3d]*\(|matrix\(([\s\w\d]*,){4,4})\s*(-?[\d\.]+)?[\w\s]*,?\s*(-?[\d\.]+)[\w\s]*.*?\)/i) || [0, 0, 0, 0, 0]);

            return {
                x: +transforms[3],
                y: +transforms[4]
            };
        },

        _wait: function (e) {
            clearTimeout(this.timeoutId);
            this._originalEvent = e;
            var startLocation = touchLocation(e);
            var scrollOffsets = this._getScrollOffsets();

            this.start = {
                idx: startLocation.idx,
                x: startLocation.x - scrollOffsets.x,
                y: startLocation.y - scrollOffsets.y
            };

            this.lastLocation = startLocation;
            this.direction = { x: 1, y: 1 };
            this.directionChange = +new Date();

            $(document)
                .bind(this._moveEvent, this._startProxy)
                .bind(this._endEvent, this._stopProxy);
        },

        _initializeBoxModel: function () {
            this.boxWidth = this.element.innerWidth();
            this.boxHeight = this.element.innerHeight();
            this.scrollWidth = this.scrollElement.innerWidth();
            this.scrollHeight = this.scrollElement.innerHeight();

            var bounceLimit = {
                    x: -this.boxWidth * this.options.bounceLimit,
                    y: -this.boxHeight * this.options.bounceLimit
                },
                bounceStop = {
                    x: -this.options.bounceStop,
                    y: -this.options.bounceStop
                };

            this.hasHorizontalScroll = this.scrollWidth > this.boxWidth;
            this.hasVerticalScroll = this.scrollHeight > this.boxHeight;
            this.xRatio = this.boxWidth / this.scrollWidth;
            this.yRatio = this.boxHeight / this.scrollHeight;
            this.minBounceLimit = bounceLimit;
            this.maxBounceLimit = {
                x: this.scrollWidth - this.boxWidth - bounceLimit.x,
                y: this.scrollHeight - this.boxHeight - bounceLimit.y
            };
            this.minBounceStop = bounceStop;
            this.maxBounceStop = {
                x: this.scrollWidth - this.boxWidth - bounceStop.x,
                y: this.scrollHeight - this.boxHeight - bounceStop.y
            };
        },

        _start: function (e) {
            if (this._dragCanceled) return;

            var currentLocation = touchLocation(e);
            if (currentLocation.idx != this.start.idx) return;
            this._dragged = false;

            if (Math.abs(this.lastLocation.x - currentLocation.x) > 10 || Math.abs(this.lastLocation.y - currentLocation.y) > 10) {
                e.preventDefault();
                this._dragged = true;

                this._initializeBoxModel();

                if (this.hasHorizontalScroll) {
                    this.xScrollbar.css('opacity');
                    this.xScrollbar
                        .css({
                                width: ~~(this.boxWidth * this.xRatio),
                                opacity: this.options.scrollbarOpacity,
                                visibility: 'visible'
                            });
                }

                if (this.hasVerticalScroll) {
                    this.yScrollbar
                        .css({
                                height: ~~(this.boxHeight * this.yRatio),
                                opacity: this.options.scrollbarOpacity,
                                visibility: 'visible'
                            });
                }

                $(document).unbind(this._moveEvent, this._startProxy)
                           .bind(this._moveEvent, this._dragProxy);
            }
        },

        _drag: function (e) {
            if (this._dragCanceled) return;

            e.preventDefault();

            var currentLocation = touchLocation(e);
            if (currentLocation.idx != this.start.idx) return;

            this._throttleCSS( currentLocation );
            this._storeLastLocation( currentLocation );
        },

        _click: function (e) {
            e.stopPropagation();
            e.preventDefault();
            this.target.unbind( 'click', this.original._click );
        },

        _stop: function (e) {
            if (this._dragCanceled) return;

            var oEvent = this._originalEvent,
                target = $(oEvent.target),
                proxy = null;

            if (this._dragged) {
                this._dragged = false;
                e.preventDefault();

                if (!kendo.support.touch) {
                    proxy = $.proxy( this._click, { original: this, target: target } );
                    target.bind( 'click', proxy );
                }

                this._initKinetikAnimation(e);
            } else {
                if (kendo.support.touch && this._originalEvent.touches.length == 1) // Fire a click event when there's no drag...
                {
                    proxy = $.proxy( this._click, { original: this, target: target } );
                    var evt = document.createEvent("MouseEvents");

                    target.unbind( 'click', proxy );
                    evt.initMouseEvent("click", oEvent.bubbles, oEvent.cancelable, oEvent.view,
                                       oEvent.detail, oEvent.screenX, oEvent.screenY, oEvent.clientX, oEvent.clientY,
                                       false, false, false, false, oEvent.button, oEvent.relatedTarget);

                    oEvent.target.dispatchEvent(evt);
                    target.bind( 'click', proxy );
                }
            }

            $(document).unbind(this._moveEvent, this._startProxy)
                       .unbind(this._moveEvent, this._dragProxy)
                       .unbind(this._endEvent, this._stopProxy);
       },

        _initKinetikAnimation: function (e) {

            this.bounceLocation = touchLocation(e);

            var velocityFactor = (+new Date() - this.directionChange) / this.options.acceleration,
                horizontalOffset = this.bounceLocation.x - this.lastLocation.x,
                verticalOffset = this.bounceLocation.y - this.lastLocation.y;

            this._startKinetikAnimation( horizontalOffset, verticalOffset, velocityFactor );
        },

        _startKinetikAnimation: function ( horizontalOffset, verticalOffset, velocityFactor ) {
            this.decelerationVelocity = { x: horizontalOffset / velocityFactor, y: verticalOffset / velocityFactor };
            this.framerate = 1000 / this.options.framerate;
            this.friction = { x: this.options.friction, y: this.options.friction };
            this.winding = false;

            if (Math.abs(this.decelerationVelocity.x) > this.options.velocity || Math.abs(this.decelerationVelocity.y) > this.options.velocity) {
                this.winding = true;
                this.lastCall = +new Date();
                clearTimeout(this.timeoutId);
                this.timeoutId = setTimeout( this._stepKinetikProxy, this.framerate );
            }
        },

        _singleStep: function () {
            var scrollOffsets = this._getScrollOffsets();

            this._decelerate( 'x', scrollOffsets.x, this.minBounceLimit.x, this.maxBounceLimit.x );
            this._decelerate( 'y', scrollOffsets.y, this.minBounceLimit.y, this.maxBounceLimit.y );

            if (Math.abs(this.decelerationVelocity.x) <= this.options.velocity && Math.abs(this.decelerationVelocity.y) <= this.options.velocity) {
                this.winding = false;
                this._endKinetikAnimation();
                return true;
            }

            return false
        },

        _scrollTo: function (x, y, duration) {

            if (!this.start)
                this._initializeBoxModel();

            this.framerate = 1000 / this.options.framerate;
            this.start = { x: 0, y: 0 };

            this.source = this.bounceLocation = this.bounceLocation || this._getScrollOffsets();
            this.lastCall = this.source.time = +new Date();

            if (duration) {
                clearTimeout(this.timeoutId);
                this.destination = { x: -x, y: -y, duration: duration };
                this.timeoutId = setTimeout(this._stepScrollProxy, this.framerate);
            } else
                this._throttleCSS({ x: -x, y: -y });
        },

        _stepScrollAnimation: function () {
            var now = +new Date(),
                timeDelta = now - this.source.time,
                timeFactor = this.destination.duration / timeDelta,
                animationIterator = Math.ceil( (now - this.lastCall) / this.framerate - 1 );

            while (animationIterator-- >= 0) {
                this.bounceLocation = {
                    x: -(-this.source.x - this.destination.x) / timeFactor,
                    y: -(-this.source.y - this.destination.y) / timeFactor
                };

                this._throttleCSS( this.bounceLocation );
            }

            if (timeDelta < this.destination.duration) {
                this.timeoutId = setTimeout( this._stepScrollProxy, this.framerate );
                this.lastCall = now;
                return;
            }
        },

        _scrollBy: function (x, y, duration) {

            if (!this.bounceLocation)
                this._initializeBoxModel();

            this.start = { x: 0, y: 0 };
            this.bounceLocation = this._getScrollOffsets();

            if (duration) {
                this._startKinetikAnimation(this.bounceLocation.x - x, this.bounceLocation.y - y, duration / this.options.acceleration);
            } else
                this._throttleCSS({ x: this.bounceLocation.x - x, y: this.bounceLocation.y - y });
        },

        _decelerate: function ( axis, scrollOffset, minBounce, maxBounce ) {
            var constraint = 0,
                bounceStop = this.options.bounceStop,
                bounceLocation = this.bounceLocation[axis],
                decelerationVelocity = this.decelerationVelocity[axis],
                friction = this.friction[axis];

            bounceLocation += decelerationVelocity;
            decelerationVelocity *= friction;

            if (-scrollOffset < minBounce)
                constraint = minBounce + scrollOffset;
            else
                if (-scrollOffset > maxBounce)
                    constraint = maxBounce + scrollOffset;

            if (constraint) {
                var constrainFactor = 0;
                friction -= this._limitValue( (bounceStop - Math.abs(constraint)) / bounceStop, .04, .9 );
                constrainFactor = constraint * this.options.bounceDeceleration;
                decelerationVelocity -= Math.abs(constrainFactor) > 1 ? constrainFactor : 1;
            }

            this.bounceLocation[axis] = bounceLocation;
            this.decelerationVelocity[axis] = decelerationVelocity;
            this.friction[axis] = this._limitValue( friction, 0, .99 );
        },

        _stepKinetikAnimation: function () {
            if (!this.winding) return;

            var now = +new Date();
            var timeDelta = now - this.lastCall;
            var animationIterator = Math.round( timeDelta / this.framerate - 1 );

            while (animationIterator-- > 0)
                if (this._singleStep()) return;

            if (this._singleStep()) return;

            this._throttleCSS( this.bounceLocation );

            this.timeoutId = setTimeout( this._stepKinetikProxy, this.framerate );
            this.lastCall = now;
        },

        _endKinetikAnimation: function () {
            this.winding = false;
            clearTimeout(this.timeoutId);

            if (this.hasHorizontalScroll)
                this.xScrollbar.css('opacity', 0);

            if (this.hasVerticalScroll)
                this.yScrollbar.css('opacity', 0);
        }
    };

    kendo.ui.plugin("Scroller", Scroller, Component);
})(jQuery, window);
