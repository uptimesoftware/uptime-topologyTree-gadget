TopologyTreeBuilder = function(options) {
	var refreshInterval = 30 * 1000;
	if (typeof options == "object" && options.refreshInterval) {
		if (typeof options.refreshInterval != "number" || options.refreshInterval < 0) {
			throw new TypeError("refreshInterval must be a positive number or zero to disable");
		}
		refreshInterval = options.refreshInterval;
	}

	var treeMargins = [ 96, 24, 126, 64 ];
	var visDimensions = new UPTIME.pub.gadgets.Dimensions(100, 100);
	var treeDimensions = toTreeDimensions(visDimensions);

	var treeTransitionDuration = 500;
	var tooltipTransitionDuration = 200;

	function translateYX(d) {
		return "translate(" + d.y + "," + d.x + ")";
	}

	function projectYX(d) {
		return [ d.y, d.x ];
	}

	function oldXY(d) {
		return {
			x : d.oldX,
			y : d.oldY
		};
	}

	var root = null;
	var refreshableNodes = {};
	var refreshTimeoutId = null;

	var currNodeId = 0;
	var tree = d3.layout.tree().size([ treeDimensions.height, treeDimensions.width ]).children(getChildren).sort(function(a, b) {
		return naturalSort(a.elementName, b.elementName);
	});

	var vis = d3.select("#tree").append("svg:svg").attr("width", visDimensions.width).attr("height", visDimensions.height)
			.append("svg:g").attr("transform", "translate(" + treeMargins[0] + "," + treeMargins[1] + ")");

	this.resize = function(dimensions) {

		visDimensions = dimensions;
		treeDimensions = toTreeDimensions(visDimensions);

		d3.select("svg").attr("width", visDimensions.width).attr("height", visDimensions.height);

		tree.size([ treeDimensions.height, treeDimensions.width ]);

		if (root != null) {
			updateTree(root);
		}

	};

	this.buildTree = function(source) {
		if (root == null) {
			source.oldX = treeDimensions.height / 2;
			source.oldY = 10;
		} else {
			source.oldX = root.x;
			source.oldY = root.y;
		}
		if (refreshTimeoutId != null) {
			clearTimeout(refreshTimeoutId);
			refreshTimeoutId = null;
		}
		refreshableNodes = {};
		root = source;
		updateTree(root);
		if (refreshInterval > 0) {
			refreshTimeoutId = setTimeout(refreshTree, refreshInterval);
		}
	};

	function refreshTree() {
		refreshTimeoutId = null;
		var promises = [];
		$.each(refreshableNodes, function(i, node) {
			promises.push(refreshElementStatus(node));
		});
		UPTIME.pub.gadgets.promises.all(promises).then(function() {
			if (refreshInterval > 0) {
				refreshTimeoutId = setTimeout(refreshTree, refreshInterval);
			}
		});
	}

	function refreshElementStatus(node) {
		var deferred = UPTIME.pub.gadgets.promises.defer();
		$.ajax("/api/v1/elements/" + node.elementId + "/status", {
			cache : false
		}).done(function(data, textStatus, jqXHR) {
			node.elementStatus = data.status;
			node.statusMessage = data.message;
			node.monitorStatus = $.map(data.monitorStatus, function(monitorStatus) {
				return monitorStatus.isHidden ? undefined : {
					id : monitorStatus.id,
					name : monitorStatus.name,
					status : monitorStatus.status
				};
			}).sort(function(a, b) {
				return naturalSort(a.name, b.name);
			});
			d3.select("#topologyTreeNode_" + node.id).attr("class", getNodeClass(node));
			deferred.resolve(node);
		}).fail(function(jqXHR, textStatus, errorThrown) {
			// TODO on 404, rebuild tree
			deferred.reject(UPTIME.pub.errors.toDisplayableJQueryAjaxError(jqXHR, textStatus, errorThrown, this));
		}).always(function() {
			refreshableNodes[node.id] = node;
		});
		return deferred.promise;
	}

	this.reset = function() {
		resetExpansions(root, null);
	};

	this.expandAll = function() {
		resetExpansions(root, "full");
	};

	function resetExpansions(node, value) {
		if (!node.hasChildren) {
			return;
		}
		if (node.expansion != value) {
			removeD3Children(node);
			node.expansion = value;
			storeExpansion(node);
			updateTree(node);
		}
		$.each(node.branches, function(i, child) {
			resetExpansions(child, value);
		});
	}

	function storeExpansion(node) {
		if (!window.localStorage || !node.hasChildren) {
			return;
		}
		if (!node.expansion) {
			window.localStorage.removeItem(expansionStorageKey(node));
			return;
		}
		window.localStorage.setItem(expansionStorageKey(node), node.expansion);
	}

	function loadStoredExpansion(node) {
		if (!window.localStorage || !node.hasChildren || node.expansion) {
			return;
		}
		node.expansion = window.localStorage.getItem(expansionStorageKey(node));
	}

	function expansionStorageKey(node) {
		return "uptime.TopologyTree." + uptimeGadget.getInstanceId() + "." + node.elementId;
	}

	function updateTree(actionNode) {
		var treeNodes = tree.nodes(root).reverse();

		detectCollisions(treeNodes);

		// select the visible nodes/links and make sure they have unique ids
		var visibleNodes = vis.selectAll("g.node").data(treeNodes, function(node) {
			return node.id || (node.id = ++currNodeId);
		});
		var visibleLinks = vis.selectAll("path.link").data(tree.links(treeNodes), function(link) {
			return link.source.id + '.' + link.target.id;
		});

		createNewNodes(visibleNodes, visibleLinks, actionNode);
		updateExistingNodes(visibleNodes, visibleLinks);
		removeExitingNodes(visibleNodes, visibleLinks, actionNode);
		treeNodes.forEach(function(node) {
			node.oldX = node.x;
			node.oldY = node.y;
		});
	}

	function toTreeDimensions(dimensions) {
		var w = dimensions.width - treeMargins[0] - treeMargins[2];
		var h = dimensions.height - treeMargins[1] - treeMargins[3];
		return new UPTIME.pub.gadgets.Dimensions(w, h);
	}

	function getChildren(node) {
		if (node.elementId != 0 && !refreshableNodes[node.id]) {
			refreshElementStatus(node);
		}
		loadStoredExpansion(node);
		if (!node.hasChildren || node.expansion == "none") {
			return [];
		}
		var children = $.merge([], node.branches);
		if (node.expansion == "full") {
			return $.merge(children, node.leaves);
		}
		return children;
	}

	function getFillColor(node) {
		if (node.elementId == 0) {
			return "black";
		}
		switch (node.elementStatus) {
		case "CRIT":
			return "#B61211";
		case "WARN":
			return "#DAD60B";
		case "OK":
			return "#67B10B";
		case "MAINT":
			return "#555B98";
		case "UNKNOWN":
		default:
			return "#E6E6E6";
		}
	}

	function getStrokeWidthBasedOnChildren(node) {
		if (node.hasChildren && node.expansion != "full") {
			if (node.expansion == "none") {
				return 6.5 + (node.branches.length + node.leaves.length) * 0.1;
			} else if (node.leaves.length > 0) {
				return 6.5 + node.leaves.length * 0.1;
			}
		}
		return 4.5;
	}

	function toggleExpansion(node) {
		if (!node.hasChildren) {
			return;
		}
		removeD3Children(node);
		if (node.expansion == "full") {
			node.expansion = "none";
		} else if (node.expansion == "none") {
			node.expansion = (node.branches.length > 0 && node.leaves.length > 0) ? "partial" : "full";
		} else {
			node.expansion = "full";
		}
		storeExpansion(node);
		updateTree(node);
	}

	function removeD3Children(node) {
		// removes D3's "children" array so we can call updateTree() to rebuild
		// it based on the expansion setting
		if (node.hasChildren && node.children) {
			$.each(node.children, function(i, child) {
				removeD3Children(child);
				delete refreshableNodes[child.id];
			});
			delete node.children;
		}
	}

	function redirectToElementProfilePage(node) {
		if (node.elementId == 0) {
			return;
		}
		var url = uptimeGadget.getElementUrls(node.elementId, node.elementName);
		window.top.location.href = url.services;
	}

	function showStatusDetail(node) {
		if (node.elementId == 0) {
			return;
		}
		var text = d3.select(this).select("text");
		text.style("fill-opacity", getTextOpacity(node));

		showStatusMessage(node);

		highlightPath(node);
	}

	function showStatusMessage(node) {
		var div = d3.select("#tooltip");

		div.transition().duration(tooltipTransitionDuration).style("opacity", 1).style("border-color", getFillColor(node));

		div.html(constructMessage(node)).style("left", (d3.event.pageX + 10) + "px").style("top", (d3.event.pageY - 28) + "px");
	}

	function constructMessage(node) {
		var message = '<ul class="tooltipDetail">';
		message += '<li><span class="tooltipDetailTitle">Element Name:</span><span>' + node.elementName + '</span></li>';
		if (node.elementStatus) {
			message += '<li><span class="tooltipDetailTitle">Element Status:</span><span>' + node.elementStatus + '</span></li>';
		}
		if (node.statusMessage) {
			message += '<li><span class="tooltipDetailTitle">Status Message:</span><span>' + node.statusMessage + '</span></li>';
		}
		message += '<li><span class="tooltipDetailTitle">Element Type:</span><span>' + node.elementType + '</span></li>';
		if (node.monitorStatus && node.monitorStatus.length > 0) {
			message += '<li class="separator"></li>';
			$.each(node.monitorStatus, function(i, monitorStatus) {
				message += '<li><span class="tooltipDetailTitle">' + monitorStatus.name + ':</span><span>' + monitorStatus.status
						+ '</span></li>';
			});
		}
		message += '</ul>';
		return message;
	}

	function hideStatusDetail(node) {

		var text = d3.select(this).select("text");
		text.style("fill-opacity", getTextOpacity(node));
		var div = d3.select("#tooltip");
		div.transition().duration(tooltipTransitionDuration).style("opacity", 1e-6);
		vis.selectAll(".link").style("stroke", null);
	}

	function highlightPath(node) {
		var eligibleTargets = getEligibleTargetIds(node);
		vis.selectAll(".link").style("stroke", function(p) {

			var linkId = p.target.id;
			if (eligibleTargets.indexOf(linkId) != -1) {
				return getFillColor(node);
			}
		});
	}

	function getEligibleTargetIds(node) {
		var eligibleIds = [];
		eligibleIds.push(node.id);
		if (node.parent) {
			eligibleIds = eligibleIds.concat(getEligibleTargetIds(node.parent));
		}
		return eligibleIds;
	}

	function getTextOpacity(node) {
		if (node.hasChildren || node.isCollide == false) {
			return 1;
		}
		return 1e-6;
	}

	function removeExitingNodes(visibleNodes, visibleLinks, actionNode) {
		var removedNodes = visibleNodes.exit().transition().duration(treeTransitionDuration).attr("transform", function(node) {
			return translateYX(actionNode);
		}).remove();
		removedNodes.select("circle").attr("r", 1e-6);
		removedNodes.select("text").style("fill-opacity", 1e-6);
		visibleLinks.exit().transition().duration(treeTransitionDuration).attr("d",
				d3.svg.diagonal().source(actionNode).target(actionNode).projection(projectYX)).remove();
	}

	function updateExistingNodes(visibleNodes, visibleLinks) {
		var updatedNodes = visibleNodes.transition().duration(treeTransitionDuration).attr("transform", translateYX);
		updatedNodes.select("circle").attr("r", getStrokeWidthBasedOnChildren);
		updatedNodes.select("text").attr("text-anchor", function(node) {
			return hasVisibleChildren(node) ? "end" : "start";
		}).attr("x", function(node) {
			return hasVisibleChildren(node) ? -12 : 12;
		}).style("fill-opacity", getTextOpacity);
		visibleLinks.transition().duration(treeTransitionDuration).attr("d", d3.svg.diagonal().projection(projectYX));
	}

	function hasVisibleChildren(node) {
		return node.hasChildren && (node.expansion == "full" || (node.expansion != "none" && node.branches.length > 0));
	}

	function createNewNodes(visibleNodes, visibleLinks, actionNode) {
		var newNodes = visibleNodes.enter().append("svg:g").attr("id", function(node) {
			return "topologyTreeNode_" + node.id;
		}).attr("class", getNodeClass).attr("transform", function(node) {
			return translateYX(oldXY(actionNode));
		}).on("mouseover", showStatusDetail).on("mouseout", hideStatusDetail);
		newNodes.append("svg:circle").attr("r", 1e-6).on("click", toggleExpansion);
		newNodes.append("svg:text").attr("dy", ".35em").text(function(node) {
			return node.elementName;
		}).style("fill-opacity", 1e-6).on("click", redirectToElementProfilePage);
		visibleLinks.enter().insert("svg:path", "g").attr("class", "link").attr("d",
				d3.svg.diagonal().source(oldXY(actionNode)).target(oldXY(actionNode)).projection(projectYX));
	}

	function getNodeClass(node) {
		if (node.elementId == 0) {
			return "node node-root";
		}
		if (node.elementStatus) {
			return "node node-" + node.elementStatus;
		}
		return "node";
	}

	function isCollide(node, node_sibling) {
		var r = getStrokeWidthBasedOnChildren(node);
		n1x1 = node.x - r, n1x2 = node.x + r;
		n1y1 = node.y - r, n1y2 = node.y + r;
		var r2 = getStrokeWidthBasedOnChildren(node_sibling);
		n2x1 = node_sibling.x - r2, n2x2 = node_sibling.x + r2;
		n2y1 = node_sibling.y - r2, n2y2 = node_sibling.y + r2;
		result = ((n1x1 < n2x2 && n1x1 > n2x1) || (n1x2 > n2x2 && n1x2 < n2x1))
				&& ((n1y1 <= n2y2 && n1y1 >= n2y1) || (n1y2 >= n2y2 && n1y2 <= n2y1));

		return result;
	}

	function detectCollisions(nodes) {
		nodes.forEach(function(node) {
			node.isCollide = false;
			if (node.parent) {
				$.each(getChildren(node.parent), function(i, sibling) {
					if (node.elementId != sibling.elementId && isCollide(node, sibling)) {
						node.isCollide = true;
					}
				});
			}
		});
	}

};