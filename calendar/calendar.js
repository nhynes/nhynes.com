(function() {
    'use strict'

    var weekShowing,
        ISO_8601 = 'YYYY-MM-DD',
        US_DATE = 'M/D/YY',
        TIME = 'h:mm a',
        DATE_HEADING = 'ddd M/D',
        ONE_WEEK = 'P7D',
        EVENT_KEY = 'FREEBUSY:',
        EVENT_TENTATIVE = /FBTYPE=BUSY-TENTATIVE:/,
        DAYS_PER_WEEK = 7,
        HALF_HOUR_MILLIS = 30 * 60 * 1000,
        SPINNER_OPTS = {
          lines: 9, // The number of lines to draw
          length: 20, // The length of each line
          width: 7, // The line thickness
          radius: 10, // The radius of the inner circle
          corners: 1, // Corner roundness (0..1)
          rotate: 28, // The rotation offset
          direction: 1, // 1: clockwise, -1: counterclockwise
          color: '#333', // #rgb or #rrggbb or array of colors
          speed: 1.1, // Rounds per second
          trail: 45, // Afterglow percentage
          shadow: false, // Whether to render a shadow
          hwaccel: true, // Whether to use hardware acceleration
          className: 'spinner', // The CSS class to assign to the spinner
          zIndex: 2e9, // The z-index (defaults to 2000000000)
          top: '50%', // Top position relative to parent
          left: '50%' // Left position relative to parent
        },
        spinner = new Spinner( SPINNER_OPTS )

    function loadCalendarData( weekStart, callback ) {
        var params = {
            start: weekStart.format( ISO_8601 ),
            period: ONE_WEEK
            },
            spinStarter = setTimeout( function() { spinner.spin( document.body ) }, 200 )

        $.get( config.url, params, function( resp ) {
            clearTimeout( spinStarter )
            spinner.stop()
            callback( resp )
        })
    }

    /**
     * Returns event times partitioned into days
     * @param {String} data the data returned from caldav in ics format
     * @return {Array[Array]} the events as [start, end] partitioned into days
     */
    function parseData( data ) {
        var firstEvent = data.indexOf( EVENT_KEY ),
            lastEvent = data.indexOf('\nEND:'),
            croppedData = data.substring( firstEvent, lastEvent ),
            events = croppedData.split('\n')

        if ( firstEvent === -1 ) {
            return []
        }

        function parseDate( fbDate ) {
            var year = fbDate.substring( 0, 4 ),
                month = fbDate.substring( 4, 6 ),
                date = fbDate.substring( 6, 8 ),
                hours = fbDate.substring( 9, 11 ),
                minutes = fbDate.substring( 11, 13 )
            return new Date( year + '-' + month + '-' + date + 'T' + hours + ':' + minutes + ':00Z' )
        }

        return events
            .reduce( function( partitions, event, i ) {
                var eventData = event
                    .substring( EVENT_KEY.length )
                    .replace( EVENT_TENTATIVE, '' )
                    .split('/').map( parseDate ),
                    lastPartition = partitions[ partitions.length - 1 ]
                if ( i > 0 && eventData[0].getDate() === lastPartition[0][0].getDate() ){
                    lastPartition.push( eventData )
                } else {
                    partitions.push([ eventData ])
                }
                return partitions
            }, [] )
    }

    /** Groups contiguous events */
    function groupEvents( daysEvents ) {
        return daysEvents.map( function( dayEvents ) {
            return dayEvents.reduce( function( grouped, event, i, events ) {
                var lastEvent = events[ i - 1 ],
                    lastEventEnd = lastEvent ? lastEvent[1].getTime() : undefined,
                    lastGrouped
                if ( event[0].getTime() <= lastEventEnd ) {
                    lastGrouped = grouped.pop()
                    grouped.push([ lastGrouped[0], event[1] ])
                } else {
                    grouped.push( event )
                }
                return grouped
            }, [] )
        })
    }

    function addMissing( daysEvents ) {
        var i = 0,
            currentDay
        while( daysEvents.length < DAYS_PER_WEEK ) {
            currentDay = moment( weekShowing ).add( i, 'days' ).date()
            if ( !daysEvents[ i ] || currentDay !== daysEvents[ i ][0][0].getDate() ) {
                daysEvents.splice( i, 0, [] )
            }
            i++
        }
        return daysEvents
    }

    function placeEvents( freebusyData ) {
        var daysEvents = addMissing( groupEvents( parseData( freebusyData ) ) ),
        timeslots = $('.timeslot'),
            formatTime = function( event ) {
                var startTime = event[0].getTime(),
                    endTime = event[1].getTime(),
                    startMoment = moment( event[0] ),
                    endMoment = moment( event[1] ),
                    format = endTime - startTime <= HALF_HOUR_MILLIS ?
                        'h:mm' : 'h:mm a'

                return [
                    startMoment.format( format ),
                    endMoment.format( format ).replace(' ', '&nbsp')
                ]
            }

        function getSlot( event ) {
            var timeStrs = formatTime( event ),
                params = {
                    dates: event,
                    slot: ( event[0].getHours() - config.day[0] ) * 2 + ( event[0].getMinutes() >= 30 ),
                    span: Math.ceil( moment( event[1] ).diff( event[0] ) / HALF_HOUR_MILLIS ),
                    timeStart: timeStrs[0],
                    timeEnd: timeStrs[1]
                }
            params.end = params.slot + params.span
            return params
        }

        function insertFree( from, to ) {
            var i
            for ( i = 0; i < to; i++ ) {
                $( timeslots[ from + i ] ).append('<td class="event free">')
            }
        }

        daysEvents.map( function( dayEvents ) {
            var prev
            if ( dayEvents.length === 0 ) {
                insertFree( 0, timeslots.length )
            }
            dayEvents.map( function( event, i ) {
                var busy

                event = getSlot( event )
                busy = $('<td class="event busy" rowspan="' + event.span + '">')
                    .html( event.timeStart + '&nbsp- ' + event.timeEnd )
                    .toggleClass( 'past', moment( event.dates[1] ).isBefore( moment() ) )
                prev = prev || { slot: 0, span: 0, end: 0 }

                if ( event.slot - prev.end > 0 ) {
                    insertFree( prev.end, event.slot - prev.end )
                }

                $( timeslots[ event.slot ] )
                .append( busy )

                if ( i === dayEvents.length - 1 && event.end < timeslots.length ) {
                    insertFree( event.end, timeslots.length - event.end )
                }

                prev = event
            })
        })
    }

    function showCalendar( weekStart ) {
        weekShowing = weekStart || moment().startOf('week')
        var weekEnd = moment( weekShowing ).endOf('week')

        if ( moment().isAfter( weekShowing ) && moment().isBefore( weekEnd ) ) {
            $( $('.day-heading')[ moment().day() ] ).addClass('today')
        } else {
            $('.day-heading').removeClass('today')
        }

        $('.week-of').html( weekShowing.format( US_DATE ) + ' - ' + weekEnd.format( US_DATE ) )
        $('.day-heading').each( function( i ) {
            this.innerHTML = moment( weekShowing ).add( i, 'days' ).format( DATE_HEADING )
        })

        loadCalendarData( weekShowing, function( data ) {
            $('.event').remove()
            placeEvents( data )
        })
    }

    function constructCalendar() {
        var numTimeslots = ( config.day[1] - config.day[0] ) * 2,
            cbody = $('.calendar-body'),
            timeslots = document.createDocumentFragment(),
            timeslot,
            timeslotHeading,
            timeslotHeadingText,
            timeslotHour,
            i

        for ( i = 0; i <= numTimeslots; i++ ) {
            timeslotHour = Math.floor( i / 2 ) + config.day[0]
            timeslot = document.createElement('tr')
            timeslot.className = 'timeslot'

            timeslotHeading = document.createElement('td')
            timeslotHeading.className = 'timeslot-heading'
            timeslotHeadingText = document.createElement('span')
            timeslotHeadingText.innerHTML = ( timeslotHour % 12 || 12 ) + ':' +
                ( i % 2 === 0 ? '00' : '30' ) + ( timeslotHour >= 12 ? ' pm' : ' am' )
            timeslotHeading.appendChild( timeslotHeadingText )
            timeslot.appendChild( timeslotHeading )

            timeslots.appendChild( timeslot )
        }

        cbody.append( timeslots )


        $('#prevWeek').click( function() {
            showCalendar( weekShowing.subtract( 7, 'days' ) )
        })
        $('#nextWeek').click( function() {
            showCalendar( weekShowing.add( 7, 'days' ) )
        })
    }

    constructCalendar()
    showCalendar()
})()
